import { HttpsError, onCall } from '../lib/runtime';
import type { AnalysisDoc, AnalysisInputDoc } from '../../../shared/analysis';
import { AnalysisRefSchema } from '../../../shared/api';
import { db, nowIso } from '../lib/admin';
import { SYSTEM_ACTOR, writeAudit } from '../lib/audit';
import { assertSameOrg, callerFrom, requirePermission } from '../lib/auth';
import { analysisError, parseRequest } from '../lib/errors';
import { log } from '../lib/log';
import { enforceRateLimit } from '../lib/rateLimit';
import { initialStages } from './create';
import { enqueueAnalysisJob } from './jobs';

export const retryAnalysis = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'createAnalysis');
  const { analysisId } = parseRequest(AnalysisRefSchema, request.data);
  await enforceRateLimit(caller.uid, 'createAnalysis');
  const ref = db.collection('analyses').doc(analysisId);
  const [snap, inputSnap] = await Promise.all([ref.get(), ref.collection('inputs').doc('primary').get()]);
  const analysis = snap.data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  if (!analysis) throw new HttpsError('not-found', 'Analysis not found.');
  if (isInFlight(analysis)) throw new HttpsError('failed-precondition', 'This analysis is already being processed.');
  const input = inputSnap.data() as AnalysisInputDoc | undefined;
  if (!input?.text) throw new HttpsError('failed-precondition', 'The document was never read successfully. Start a new analysis with a valid file.');

  const stages = initialStages(analysis.inputMode);
  if (analysis.inputMode === 'DOCUMENT') {
    stages.UPLOADING = analysis.stages.UPLOADING ?? { state: 'DONE' };
    stages.READING_DOCUMENT = analysis.stages.READING_DOCUMENT ?? { state: 'DONE' };
  }
  await ref.update({ status: 'QUEUED', error: null, stages, currentStage: null, attempt: analysis.attempt + 1, updatedAt: nowIso(), completedAt: null });
  await writeAudit({
    action: 'ANALYSIS_RETRIED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    analysisId,
    targetType: 'analysis',
    targetId: analysisId,
    summary: `Analysis re-run (attempt ${analysis.attempt + 1}).`,
  });
  await enqueueAnalysisJob(analysisId, caller.orgId, 'RETRY');
  return { ok: true };
});

/** No progress for this long means the run died (a run is capped well below it by PIPELINE_DEADLINE_MS). */
export const PROCESSING_TIMEOUT_MINUTES = 10;
export const UPLOAD_EXPIRY_HOURS = 24;

/** Queued or processing, and still making progress. A stale run may be retried without waiting for the sweep. */
export function isInFlight(analysis: Pick<AnalysisDoc, 'status' | 'updatedAt'>, nowMs = Date.now()): boolean {
  if (analysis.status !== 'PROCESSING' && analysis.status !== 'QUEUED') return false;
  return nowMs - Date.parse(analysis.updatedAt) < PROCESSING_TIMEOUT_MINUTES * 60_000;
}

/** Marks stuck analyses as failed so the UI never shows endless progress. Run daily by Vercel Cron. */
export async function sweepStaleAnalyses(): Promise<{ processing: number; uploads: number }> {
  const processingCutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MINUTES * 60_000).toISOString();
  const uploadCutoff = new Date(Date.now() - UPLOAD_EXPIRY_HOURS * 3_600_000).toISOString();
  const [stuck, queued, uploads] = await Promise.all([
    db.collection('analyses').where('status', '==', 'PROCESSING').where('updatedAt', '<', processingCutoff).limit(100).get(),
    db.collection('analyses').where('status', '==', 'QUEUED').where('updatedAt', '<', processingCutoff).limit(100).get(),
    db.collection('analyses').where('status', '==', 'AWAITING_UPLOAD').where('updatedAt', '<', uploadCutoff).limit(100).get(),
  ]);
  const writer = db.bulkWriter();
  for (const doc of [...stuck.docs, ...queued.docs]) {
    void writer.update(doc.ref, { status: 'FAILED', error: analysisError('PROCESSING_TIMEOUT'), currentStage: null, updatedAt: nowIso() });
  }
  for (const doc of uploads.docs) {
    void writer.update(doc.ref, { status: 'FAILED', error: analysisError('UPLOAD_EXPIRED'), currentStage: null, updatedAt: nowIso() });
  }
  await writer.close();
  const total = stuck.size + queued.size + uploads.size;
  if (total) {
    log.warn('sweep.marked_failed', { processing: stuck.size + queued.size, uploads: uploads.size });
    await writeAudit({ ...SYSTEM_ACTOR, action: 'ANALYSIS_FAILED', orgId: null, targetType: 'sweep', targetId: 'sweepStaleAnalyses', summary: `${total} stale analyses marked as failed.` });
  }
  return { processing: stuck.size + queued.size, uploads: uploads.size };
}
