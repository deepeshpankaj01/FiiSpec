import { onCall } from 'firebase-functions/https';
import { HttpsError } from 'firebase-functions/https';
import type { AnalysisDoc, AnalysisInputDoc, AnalysisInputForm, StageProgress } from '../../../shared/analysis';
import { CreateAnalysisSchema, type CreateAnalysisRequest } from '../../../shared/api';
import type { InputMode, PipelineStage } from '../../../shared/constants';
import { MAX_SPEC_TEXT_CHARS, PIPELINE_STAGES } from '../../../shared/constants';
import { BenchmarkCaseSchema } from '../../../shared/knowledge';
import { db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { callerFrom, requirePermission } from '../lib/auth';
import { ENFORCE_APP_CHECK, FUNCTIONS_REGION } from '../lib/config';
import { parseRequest } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';
import { enqueueAnalysisJob } from './jobs';

/** Combine the structured form into the text the pipeline analyses. */
export function composeInputText(req: { mode: InputMode; form: AnalysisInputForm }): string {
  const f = req.form;
  const lines: string[] = [];
  if (f.product) lines.push(`Product: ${f.product}`);
  if (f.purpose) lines.push(`Purpose: ${f.purpose}`);
  if (req.mode === 'DESCRIPTION' && f.description) lines.push(f.description);
  if (req.mode !== 'DESCRIPTION' && f.technicalSpecification) lines.push(f.technicalSpecification);
  if (f.procurementContext) lines.push(`Procurement context: ${f.procurementContext}`);
  return lines.join('\n').slice(0, MAX_SPEC_TEXT_CHARS);
}

export function deriveTitle(req: Pick<CreateAnalysisRequest, 'mode' | 'form' | 'file'>): string {
  if (req.form.product?.trim()) return req.form.product.trim().slice(0, 120);
  const text = (req.mode === 'DESCRIPTION' ? req.form.description : req.form.technicalSpecification) ?? '';
  const firstLine = text.split(/\n|(?<=\.)\s/)[0]?.trim();
  if (firstLine) return firstLine.length > 90 ? `${firstLine.slice(0, 89)}…` : firstLine;
  return req.file?.name ?? 'Untitled analysis';
}

export function initialStages(mode: CreateAnalysisRequest['mode']): Partial<Record<PipelineStage, StageProgress>> {
  const stages: Partial<Record<PipelineStage, StageProgress>> = {};
  for (const stage of PIPELINE_STAGES) {
    const documentOnly = stage === 'UPLOADING' || stage === 'READING_DOCUMENT';
    stages[stage] = { state: documentOnly && mode !== 'DOCUMENT' ? 'SKIPPED' : 'PENDING' };
  }
  return stages;
}

function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-120);
  return cleaned || 'document';
}

export const createAnalysis = onCall({ region: FUNCTIONS_REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = requirePermission(callerFrom(request), 'createAnalysis');
  let req = parseRequest(CreateAnalysisSchema, request.data);
  await enforceRateLimit(caller.uid, 'createAnalysis');

  // Demo cases: the prepared input is loaded server-side and runs through the real pipeline.
  let isDemo = false;
  if (req.benchmarkCaseId) {
    const snap = await db.collection('benchmarkCases').doc(req.benchmarkCaseId).get();
    const parsed = BenchmarkCaseSchema.safeParse({ ...snap.data(), id: snap.id });
    if (!snap.exists || !parsed.success || !parsed.data.isDemo || parsed.data.lifecycle !== 'PUBLISHED') {
      throw new HttpsError('not-found', 'Demo case not found.');
    }
    const c = parsed.data;
    isDemo = true;
    req = {
      mode: c.inputMode,
      form: c.inputMode === 'DESCRIPTION' ? { description: c.inputText } : { technicalSpecification: c.inputText },
      benchmarkCaseId: c.id,
    };
  }

  const ref = db.collection('analyses').doc();
  const now = nowIso();
  const storagePath = req.mode === 'DOCUMENT' && req.file
    ? `organizations/${caller.orgId}/analyses/${ref.id}/input/${safeFileName(req.file.name)}`
    : null;

  const analysis: AnalysisDoc = {
    id: ref.id,
    orgId: caller.orgId,
    createdBy: caller.uid,
    createdByName: caller.name,
    title: deriveTitle(req),
    productName: req.form.product?.trim() || '',
    inputMode: req.mode,
    status: req.mode === 'DOCUMENT' ? 'AWAITING_UPLOAD' : 'QUEUED',
    currentStage: req.mode === 'DOCUMENT' ? 'UPLOADING' : null,
    stages: initialStages(req.mode),
    summary: null,
    error: null,
    reviewStatus: 'NONE',
    specStatus: 'NONE',
    aiMode: null,
    detectedLanguage: null,
    file: req.file && storagePath ? { name: req.file.name, size: req.file.size, contentType: req.file.contentType, storagePath } : null,
    isDemo,
    benchmarkCaseId: req.benchmarkCaseId ?? null,
    attempt: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  if (analysis.stages.UPLOADING && req.mode === 'DOCUMENT') analysis.stages.UPLOADING = { state: 'RUNNING', startedAt: now };

  const input: AnalysisInputDoc = {
    mode: req.mode,
    form: req.form,
    text: req.mode === 'DOCUMENT' ? '' : composeInputText(req),
    truncated: false,
    document: null,
  };

  const batch = db.batch();
  batch.set(ref, analysis);
  batch.set(ref.collection('inputs').doc('primary'), { ...input, orgId: caller.orgId });
  await batch.commit();

  await writeAudit({
    action: 'ANALYSIS_CREATED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    analysisId: ref.id,
    targetType: 'analysis',
    targetId: ref.id,
    summary: `Analysis created from ${req.mode.toLowerCase()}${isDemo ? ' (demo case)' : ''}.`,
    metadata: { mode: req.mode, isDemo, fileSize: req.file?.size ?? null },
  });

  if (req.mode !== 'DOCUMENT') await enqueueAnalysisJob(ref.id, caller.orgId, 'CREATE');
  return { analysisId: ref.id, uploadPath: storagePath };
});
