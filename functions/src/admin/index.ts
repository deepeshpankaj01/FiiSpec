/**
 * Administrator operations on the knowledge base. All writes are validated
 * with the canonical schemas, audit-logged, and never hard-delete records
 * (records are archived instead).
 */
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/https';
import type { z } from 'zod';
import {
  AdminIngestionDecisionSchema,
  AdminResolveFeedbackSchema,
  AdminRunBenchmarksSchema,
  AdminSetLifecycleSchema,
  AdminStageIngestionSchema,
  AdminUpsertBenchmarkCaseSchema,
  AdminUpsertCertificationRuleSchema,
  AdminUpsertRelationshipSchema,
  AdminUpsertStandardSchema,
  AdminVerifyRecordSchema,
} from '../../../shared/api';
import type { DataOrigin } from '../../../shared/constants';
import {
  BenchmarkCaseSchema,
  CertificationRuleSchema,
  RelationshipRecordSchema,
  type SourceRef,
  StandardRecordSchema,
  type Verification,
} from '../../../shared/knowledge';
import { getAiClient } from '../ai/factory';
import { evaluateCase, summarize } from '../engine/benchmark';
import { db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { type Caller, callerFrom, requireAdmin } from '../lib/auth';
import { ANTHROPIC_API_KEY, ENFORCE_APP_CHECK, FUNCTIONS_REGION } from '../lib/config';
import { parseRequest } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';
import { invalidateKnowledgeBaseCache, loadKnowledgeBase, withoutId } from '../standards/repository';

const opts = { region: FUNCTIONS_REGION, enforceAppCheck: ENFORCE_APP_CHECK };

const EDITED: Verification = { status: 'UNVERIFIED', note: 'Record edited by an administrator — re-verification required.' };

function audit(caller: Caller, action: Parameters<typeof writeAudit>[0]['action'], targetType: string, targetId: string, summary: string, metadata: Record<string, string | number | boolean | null> = {}) {
  return writeAudit({ action, actorId: caller.uid, actorName: caller.name, actorRole: caller.role, orgId: null, targetType, targetId, summary, metadata });
}

/** Shared upsert: validates, resets verification on content change, stamps metadata, audits. */
async function upsert<T extends { id: string; verification?: Verification }>(
  caller: Caller,
  collection: string,
  record: T,
  label: string,
): Promise<{ created: boolean }> {
  const ref = db.collection(collection).doc(record.id);
  const existing = await ref.get();
  const created = !existing.exists;
  const body: Record<string, unknown> = { ...withoutId(record), updatedAt: nowIso(), updatedBy: caller.name };
  if ('verification' in record) body.verification = created ? { status: 'UNVERIFIED', note: 'Created by an administrator — pending verification.' } : EDITED;
  if (created) body.createdAt = nowIso();
  await ref.set(body, { merge: false });
  await invalidateKnowledgeBaseCache();
  await audit(caller, created ? 'KB_RECORD_CREATED' : 'KB_RECORD_UPDATED', collection, record.id, `${label} ${record.id} ${created ? 'created' : 'updated'}.`);
  return { created };
}

async function assertStandardsExist(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const snaps = await Promise.all(unique.map((id) => db.collection('standards').doc(id).get()));
  const missing = unique.filter((_, i) => !snaps[i]!.exists);
  if (missing.length) throw new HttpsError('invalid-argument', `Unknown standard id(s): ${missing.join(', ')}`);
}

export const adminUpsertStandard = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const { record } = parseRequest(AdminUpsertStandardSchema, request.data);
  const links = [...record.supersedes.map((s) => s.standardId), record.supersededBy?.standardId].filter((x): x is string => Boolean(x) && x !== record.id);
  if (links.length) await assertStandardsExist(links);
  return upsert(caller, 'standards', record, 'Standard');
});

export const adminUpsertRelationship = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const { record } = parseRequest(AdminUpsertRelationshipSchema, request.data);
  if (record.fromId === record.toId) throw new HttpsError('invalid-argument', 'A standard cannot be related to itself.');
  await assertStandardsExist([record.fromId, record.toId]);
  return upsert(caller, 'standardRelationships', record, 'Relationship');
});

export const adminUpsertCertificationRule = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const { record } = parseRequest(AdminUpsertCertificationRuleSchema, request.data);
  if (record.standardIds.length) await assertStandardsExist(record.standardIds);
  return upsert(caller, 'certificationRules', record, 'Certification rule');
});

export const adminUpsertBenchmarkCase = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const { record } = parseRequest(AdminUpsertBenchmarkCaseSchema, request.data);
  await assertStandardsExist([...record.expectedStandardIds, ...record.expectedPrimaryIds]);
  return upsert(caller, 'benchmarkCases', record, 'Benchmark case');
});

export const adminSetLifecycle = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const req = parseRequest(AdminSetLifecycleSchema, request.data);
  const ref = db.collection(req.collection).doc(req.id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Record not found.');
  const from = (snap.data()?.lifecycle as string | undefined) ?? 'UNKNOWN';
  await ref.update({ lifecycle: req.lifecycle, updatedAt: nowIso(), updatedBy: caller.name });
  await invalidateKnowledgeBaseCache();
  await audit(caller, 'KB_RECORD_LIFECYCLE_CHANGED', req.collection, req.id, `${from} → ${req.lifecycle}: ${req.reason}`, { from, to: req.lifecycle });
  return { ok: true };
});

export const adminVerifyRecord = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const req = parseRequest(AdminVerifyRecordSchema, request.data);
  const ref = db.collection(req.collection).doc(req.id);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Record not found.');
  const verification: Verification = { status: req.status, verifiedBy: caller.name, verifiedAt: nowIso(), note: req.note };
  await ref.update({ verification, updatedAt: nowIso() });
  await invalidateKnowledgeBaseCache();
  await audit(caller, 'KB_RECORD_VERIFIED', req.collection, req.id, `Marked ${req.status.toLowerCase()}: ${req.note}`, { status: req.status });
  return { ok: true };
});

// --- Controlled ingestion ---------------------------------------------------

const RECORD_SCHEMAS = {
  standards: StandardRecordSchema,
  standardRelationships: RelationshipRecordSchema,
  certificationRules: CertificationRuleSchema,
} as const;

export function originFor(source: SourceRef): DataOrigin {
  return ['BIS_CATALOGUE', 'BIS_PUBLIC_DOCUMENT', 'GAZETTE_NOTIFICATION', 'GOVERNMENT_PORTAL'].includes(source.sourceType)
    ? 'OFFICIAL_SOURCE'
    : 'CURATED_PUBLIC_REFERENCE';
}

/** Pure validation of an ingestion payload, unit-tested. */
export function validateIngestionPayload(recordType: keyof typeof RECORD_SCHEMAS, payload: string): {
  valid: z.infer<(typeof RECORD_SCHEMAS)[keyof typeof RECORD_SCHEMAS]>[];
  errors: { index: number; message: string }[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { valid: [], errors: [{ index: -1, message: 'Payload is not valid JSON.' }] };
  }
  if (!Array.isArray(parsed)) return { valid: [], errors: [{ index: -1, message: 'Payload must be a JSON array of records.' }] };
  if (parsed.length > 200) return { valid: [], errors: [{ index: -1, message: 'At most 200 records per ingestion batch.' }] };
  const schema = RECORD_SCHEMAS[recordType];
  const valid: z.infer<(typeof RECORD_SCHEMAS)[keyof typeof RECORD_SCHEMAS]>[] = [];
  const errors: { index: number; message: string }[] = [];
  parsed.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) valid.push(result.data);
    else errors.push({ index, message: result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  });
  return { valid, errors };
}

export const adminStageIngestion = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const req = parseRequest(AdminStageIngestionSchema, request.data);
  const { valid, errors } = validateIngestionPayload(req.recordType, req.payload);
  const contentHash = createHash('sha256').update(req.payload).digest('hex');
  const existing = await Promise.all(valid.map((r) => db.collection(req.recordType).doc(r.id).get()));
  const ref = db.collection('ingestionRecords').doc();
  await ref.set({
    id: ref.id,
    source: req.source.name,
    sourceUrl: req.source.url ?? null,
    sourceType: req.source.sourceType,
    retrievedAt: req.source.retrievedAt ?? null,
    version: req.version,
    contentHash,
    recordType: req.recordType,
    status: valid.length ? 'STAGED' : 'INVALID',
    verificationStatus: 'UNVERIFIED',
    records: valid,
    errors,
    counts: { valid: valid.length, invalid: errors.length, new: existing.filter((s) => !s.exists).length, updates: existing.filter((s) => s.exists).length },
    stagedBy: caller.name,
    stagedAt: nowIso(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  });
  await audit(caller, 'INGESTION_STAGED', 'ingestionRecords', ref.id, `Staged ${valid.length} ${req.recordType} record(s) from ${req.source.name} (${errors.length} invalid).`, { contentHash });
  return { ingestionId: ref.id, valid: valid.length, invalid: errors.length };
});

export const adminDecideIngestion = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const req = parseRequest(AdminIngestionDecisionSchema, request.data);
  const ref = db.collection('ingestionRecords').doc(req.ingestionId);
  const data = (await ref.get()).data() as
    | { status: string; recordType: keyof typeof RECORD_SCHEMAS; records: { id: string }[]; source: string; sourceUrl: string | null; sourceType: SourceRef['sourceType']; retrievedAt: string | null }
    | undefined;
  if (!data) throw new HttpsError('not-found', 'Ingestion record not found.');
  if (data.status !== 'STAGED') throw new HttpsError('failed-precondition', `This batch is ${data.status.toLowerCase()} and cannot be changed.`);
  if (req.decision === 'REJECT') {
    await ref.update({ status: 'REJECTED', decidedBy: caller.name, decidedAt: nowIso(), decisionNote: req.note });
    await audit(caller, 'INGESTION_REJECTED', 'ingestionRecords', req.ingestionId, `Rejected: ${req.note}`);
    return { published: 0 };
  }
  const source: SourceRef = { name: data.source, url: data.sourceUrl ?? undefined, retrievedAt: data.retrievedAt ?? undefined, sourceType: data.sourceType };
  const verification: Verification = req.markVerified
    ? { status: 'VERIFIED', verifiedBy: caller.name, verifiedAt: nowIso(), note: `Verified at ingestion: ${req.note}` }
    : { status: 'UNVERIFIED', note: `Ingested from ${data.source}; pending verification.` };
  const writer = db.bulkWriter();
  for (const record of data.records) {
    const body: Record<string, unknown> = { ...withoutId(record), lifecycle: 'PUBLISHED', verification, updatedAt: nowIso(), updatedBy: caller.name, ingestionId: req.ingestionId };
    if (data.recordType !== 'standardRelationships') body.dataOrigin = originFor(source);
    void writer.set(db.collection(data.recordType).doc(record.id), body);
  }
  await writer.close();
  await ref.update({ status: 'PUBLISHED', verificationStatus: verification.status, decidedBy: caller.name, decidedAt: nowIso(), decisionNote: req.note });
  await invalidateKnowledgeBaseCache();
  await audit(caller, 'INGESTION_PUBLISHED', 'ingestionRecords', req.ingestionId, `Published ${data.records.length} ${data.recordType} record(s)${req.markVerified ? ' as verified' : ''}.`, { count: data.records.length });
  return { published: data.records.length };
});

// --- Benchmarks -------------------------------------------------------------

export const adminRunBenchmarks = onCall({ ...opts, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const req = parseRequest(AdminRunBenchmarksSchema, request.data);
  await enforceRateLimit(caller.uid, 'runBenchmarks');
  const kb = await loadKnowledgeBase({ fresh: true });
  const snap = await db.collection('benchmarkCases').where('lifecycle', '==', 'PUBLISHED').get();
  const cases = snap.docs
    .map((d) => BenchmarkCaseSchema.safeParse({ ...d.data(), id: d.id }))
    .filter((p) => p.success)
    .map((p) => p.data!)
    .filter((c) => !req.caseIds || req.caseIds.includes(c.id));
  if (!cases.length) throw new HttpsError('failed-precondition', 'No published benchmark cases to run.');
  const ai = req.useAi ? await getAiClient() : null;
  if (req.useAi && !ai) throw new HttpsError('failed-precondition', 'AI is not configured, so an AI-assisted benchmark cannot run.');
  const results = [];
  for (const c of cases) results.push(await evaluateCase(c, kb, ai));
  const summary = summarize(results, ai ? 'AI_ASSISTED' : 'DETERMINISTIC_ONLY');
  const runRef = db.collection('benchmarkRuns').doc();
  await runRef.set({ id: runRef.id, summary, results, runBy: caller.name, runAt: nowIso(), model: ai?.model ?? null, knowledgeBase: { standards: kb.standards.length, relationships: kb.relationships.length, loadedAt: kb.loadedAt } });
  const writer = db.bulkWriter();
  for (const r of results) void writer.update(db.collection('benchmarkCases').doc(r.caseId), { lastRun: { runId: runRef.id, runAt: nowIso(), primaryHit: r.primaryHit, standardRecall: r.standardRecall, standardPrecision: r.standardPrecision, abstentionCorrect: r.abstentionCorrect } });
  await writer.close();
  await audit(caller, 'BENCHMARK_RUN', 'benchmarkRuns', runRef.id, `Benchmark run over ${results.length} case(s): primary hit rate ${summary.primaryHitRate}.`, { aiMode: summary.aiMode });
  return { runId: runRef.id, summary };
});

export const adminResolveFeedback = onCall(opts, async (request) => {
  const caller = requireAdmin(callerFrom(request));
  const req = parseRequest(AdminResolveFeedbackSchema, request.data);
  const ref = db.collection('feedback').doc(req.feedbackId);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Feedback not found.');
  await ref.update({ status: req.status, resolvedBy: caller.name, resolvedAt: nowIso() });
  return { ok: true };
});
