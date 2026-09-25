import { HttpsError, onCall } from 'firebase-functions/https';
import { onSchedule } from 'firebase-functions/scheduler';
import type { AnalysisDoc, AnalysisInputDoc } from '../../../shared/analysis';
import { AnalysisRefSchema } from '../../../shared/api';
import { db, nowIso } from '../lib/admin';
import { SYSTEM_ACTOR, writeAudit } from '../lib/audit';
import { assertSameOrg, callerFrom, requirePermission } from '../lib/auth';
import { ENFORCE_APP_CHECK, FUNCTIONS_REGION } from '../lib/config';
import { analysisError, parseRequest } from '../lib/errors';
import { log } from '../lib/log';
import { enforceRateLimit } from '../lib/rateLimit';
import { initialStages } from './create';
import { enqueueAnalysisJob } from './jobs';

export const retryAnalysis = onCall({ region: FUNCTIONS_REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = requirePermission(callerFrom(request), 'createAnalysis');
  const { analysisId } = parseRequest(AnalysisRefSchema, request.data);
  await enforceRateLimit(caller.uid, 'createAnalysis');
  const ref = db.collection('analyses').doc(analysisId);
  const [snap, inputSnap] = await Promise.all([ref.get(), ref.collection('inputs').doc('primary').get()]);
  const analysis = snap.data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  if (!analysis) throw new HttpsError('not-found', 'Analysis not found.');
  if (analysis.status === 'PROCESSING' || analysis.status === 'QUEUED') throw new HttpsError('failed-precondition', 'This analysis is already being processed.');
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

export const PROCESSING_TIMEOUT_MINUTES = 12;
export const UPLOAD_EXPIRY_HOURS = 24;

/** Marks stuck analyses as failed so the UI never shows endless progress. */
export const sweepStaleAnalyses = onSchedule({ schedule: 'every 10 minutes', region: FUNCTIONS_REGION, timeoutSeconds: 120 }, async () => {
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
});
