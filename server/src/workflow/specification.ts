import { HttpsError, onCall } from '../lib/runtime';
import type { AnalysisDoc, AnalysisResultDoc, GeneratedSpecificationDoc, SpecSection, SpecificationGap } from '../../../shared/analysis';
import { ApproveSpecificationSchema, SaveSpecificationSchema, AnalysisRefSchema } from '../../../shared/api';
import { getAiClient } from '../ai/factory';
import { specDraftingPrompt } from '../ai/prompts';
import { formatParameter } from '../engine/parameters';
import { applyAiDraft, baseNumbersOf, buildDeterministicDraft, validateAiDraft } from '../engine/specgen';
import { db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { assertSameOrg, callerFrom, requirePermission } from '../lib/auth';
import { parseRequest } from '../lib/errors';
import { log } from '../lib/log';
import { incrementMetrics } from '../lib/metrics';
import { enforceRateLimit } from '../lib/rateLimit';


export const generateProcurementSpecification = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'generateSpecification');
  const { analysisId } = parseRequest(AnalysisRefSchema, request.data);
  await enforceRateLimit(caller.uid, 'generateSpecification');
  const analysisRef = db.collection('analyses').doc(analysisId);
  const analysis = (await analysisRef.get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  if (!analysis || (analysis.status !== 'COMPLETED' && analysis.status !== 'REVIEW_REQUIRED')) {
    throw new HttpsError('failed-precondition', 'The analysis must finish before a specification can be generated.');
  }
  const [resultSnap, gapsSnap, specsSnap] = await Promise.all([
    analysisRef.collection('results').doc('current').get(),
    analysisRef.collection('gaps').get(),
    analysisRef.collection('specifications').get(),
  ]);
  const result = resultSnap.data() as AnalysisResultDoc | undefined;
  if (!result) throw new HttpsError('failed-precondition', 'Analysis results are not available.');
  const gaps = gapsSnap.docs.map((d) => d.data() as SpecificationGap);

  let sections = buildDeterministicDraft({ result, gaps });
  let method: GeneratedSpecificationDoc['generation']['method'] = 'DETERMINISTIC';
  let aiRejectedReason: string | null = null;

  const ai = await getAiClient();
  if (ai) {
    const usable = result.recommendations.filter((r) => !r.reviewRequired);
    const openMissing = gaps.filter((g) => g.category === 'MISSING_PARAMETER' && (g.status === 'OPEN' || g.status === 'ACCEPTED'));
    const res = await ai.generate(specDraftingPrompt, {
      productName: result.specification.productName,
      requirementSummary: result.specification.normalizedSummary.slice(0, 3000),
      parameters: result.specification.technicalParameters.filter((p) => p.kind !== 'QUANTITY').map((p) => `${p.label}: ${formatParameter(p)}`),
      allowedStandards: usable.map((r) => `${r.standardNumber} — ${r.title}`),
      openGaps: openMissing.map((g) => g.issue),
    });
    if (res.ok) {
      const check = validateAiDraft(res.data, baseNumbersOf(usable), openMissing.length);
      if (check.ok) {
        sections = applyAiDraft(sections, res.data);
        method = 'AI_ASSISTED';
      } else {
        aiRejectedReason = check.reason;
        log.warn('spec.ai_draft_rejected', { analysisId, reason: check.reason });
      }
    } else {
      aiRejectedReason = `AI drafting unavailable (${res.error}).`;
    }
    await incrementMetrics({ aiRequests: 1, aiFailures: res.ok ? 0 : 1, aiLatencyMsTotal: res.latencyMs });
  }

  const ref = analysisRef.collection('specifications').doc();
  const now = nowIso();
  const doc: GeneratedSpecificationDoc = {
    id: ref.id,
    analysisId,
    orgId: caller.orgId,
    version: specsSnap.size + 1,
    status: 'AI_DRAFT',
    sections,
    generation: { method, promptVersion: method === 'AI_ASSISTED' ? specDraftingPrompt.version : null, aiRejectedReason },
    createdBy: caller.uid,
    createdAt: now,
    updatedAt: now,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    reviewNote: null,
  };
  await ref.set(doc);
  await analysisRef.update({ specStatus: 'AI_DRAFT', updatedAt: now });
  await incrementMetrics({ specificationsGenerated: 1 });
  await writeAudit({
    action: 'SPEC_GENERATED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    analysisId,
    targetType: 'specification',
    targetId: ref.id,
    summary: `Procurement specification draft v${doc.version} generated (${method === 'AI_ASSISTED' ? 'AI-assisted wording' : 'deterministic template'}).`,
    metadata: { method, aiRejected: aiRejectedReason !== null },
  });
  return { specId: ref.id };
});

/** Items whose text/origin are unchanged keep their origin; anything else is labelled as a human edit. */
export function reconcileOrigins(incoming: SpecSection[], stored: SpecSection[]): SpecSection[] {
  return incoming.map((section) => {
    const previous = stored.find((s) => s.key === section.key);
    const known = new Set((previous?.items ?? []).map((i) => `${i.origin}|${i.text}`));
    return {
      ...section,
      items: section.items.map((i) => (known.has(`${i.origin}|${i.text}`) ? i : { ...i, origin: 'HUMAN_EDIT' as const })),
    };
  });
}

export const saveSpecificationDraft = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'editSpecification');
  const req = parseRequest(SaveSpecificationSchema, request.data);
  const analysisRef = db.collection('analyses').doc(req.analysisId);
  const analysis = (await analysisRef.get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  const specRef = analysisRef.collection('specifications').doc(req.specId);
  const spec = (await specRef.get()).data() as GeneratedSpecificationDoc | undefined;
  if (!spec) throw new HttpsError('not-found', 'Specification not found.');
  if (spec.status === 'HUMAN_REVIEWED') throw new HttpsError('failed-precondition', 'Approved specifications are locked. Generate a new draft to make changes.');
  const withTitles = req.sections.map((s) => ({ ...s, title: spec.sections.find((x) => x.key === s.key)?.title ?? s.key }));
  const sections = reconcileOrigins(withTitles, spec.sections);
  await specRef.update({ sections, updatedAt: nowIso() });
  await writeAudit({ action: 'SPEC_EDITED', actorId: caller.uid, actorName: caller.name, actorRole: caller.role, orgId: caller.orgId, analysisId: req.analysisId, targetType: 'specification', targetId: req.specId, summary: `Specification draft v${spec.version} edited.` });
  return { ok: true };
});

export const approveSpecification = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'approveSpecification');
  const req = parseRequest(ApproveSpecificationSchema, request.data);
  const analysisRef = db.collection('analyses').doc(req.analysisId);
  const analysis = (await analysisRef.get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  const specRef = analysisRef.collection('specifications').doc(req.specId);
  const spec = (await specRef.get()).data() as GeneratedSpecificationDoc | undefined;
  if (!spec) throw new HttpsError('not-found', 'Specification not found.');
  if (spec.status === 'HUMAN_REVIEWED') throw new HttpsError('failed-precondition', 'This specification is already approved.');
  const placeholders = spec.sections.flatMap((s) => s.items).filter((i) => i.origin === 'GAP_PLACEHOLDER');
  if (placeholders.length) {
    throw new HttpsError('failed-precondition', `Resolve or remove ${placeholders.length} placeholder item(s) before approval.`);
  }
  const now = nowIso();
  await specRef.update({ status: 'HUMAN_REVIEWED', approvedBy: caller.uid, approvedByName: caller.name, approvedAt: now, reviewNote: req.note ?? null, updatedAt: now });
  await analysisRef.update({ specStatus: 'HUMAN_REVIEWED', updatedAt: now });
  await writeAudit({ action: 'SPEC_APPROVED', actorId: caller.uid, actorName: caller.name, actorRole: caller.role, orgId: caller.orgId, analysisId: req.analysisId, targetType: 'specification', targetId: req.specId, summary: `Specification v${spec.version} approved as human-reviewed.${req.note ? ` Note: ${req.note}` : ''}` });
  return { ok: true };
});
