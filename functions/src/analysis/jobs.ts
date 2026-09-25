/**
 * Analysis job queue. Each processing attempt is a document in
 * analysisJobs/{jobId}; a Firestore trigger claims it transactionally
 * (idempotent under at-least-once delivery) and runs the pipeline.
 */
import { onDocumentCreated } from 'firebase-functions/firestore';
import type { AnalysisDoc, AnalysisInputDoc, EvidenceItem, SpecificationGap, StageProgress } from '../../../shared/analysis';
import type { PipelineStage } from '../../../shared/constants';
import { getAiClient } from '../ai/factory';
import { runPipeline } from '../engine/pipeline';
import { db, nowIso } from '../lib/admin';
import { SYSTEM_ACTOR, writeAudit } from '../lib/audit';
import { ANTHROPIC_API_KEY, FUNCTIONS_REGION } from '../lib/config';
import { PipelineFailure, analysisError } from '../lib/errors';
import { log } from '../lib/log';
import { incrementMetrics } from '../lib/metrics';
import { loadKnowledgeBase } from '../standards/repository';

export interface AnalysisJobDoc {
  analysisId: string;
  orgId: string;
  reason: 'CREATE' | 'UPLOAD' | 'RETRY';
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export async function enqueueAnalysisJob(analysisId: string, orgId: string, reason: AnalysisJobDoc['reason']): Promise<void> {
  const job: AnalysisJobDoc = { analysisId, orgId, reason, status: 'PENDING', createdAt: nowIso(), startedAt: null, finishedAt: null };
  await db.collection('analysisJobs').add(job);
}

async function claimJob(jobId: string): Promise<AnalysisJobDoc | null> {
  const ref = db.collection('analysisJobs').doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const job = snap.data() as AnalysisJobDoc | undefined;
    if (!job || job.status !== 'PENDING') return null;
    tx.update(ref, { status: 'RUNNING', startedAt: nowIso() });
    return job;
  });
}

/** Replace a subcollection's documents with a new set (used on retry). */
async function replaceSubcollection(analysisId: string, name: string, docs: { id: string }[], orgId: string): Promise<void> {
  const col = db.collection('analyses').doc(analysisId).collection(name);
  const existing = await col.listDocuments();
  const writer = db.bulkWriter();
  const keep = new Set(docs.map((d) => d.id));
  for (const ref of existing) if (!keep.has(ref.id)) void writer.delete(ref);
  for (const d of docs) void writer.set(col.doc(d.id), { ...d, orgId, analysisId });
  await writer.close();
}

export async function processAnalysisJob(jobId: string): Promise<void> {
  const job = await claimJob(jobId);
  if (!job) return;
  const analysisRef = db.collection('analyses').doc(job.analysisId);
  const started = Date.now();
  const stageUpdate = (stage: PipelineStage, progress: StageProgress) => ({
    [`stages.${stage}`]: progress,
    currentStage: stage,
    updatedAt: nowIso(),
  });
  const stageStarts = new Map<PipelineStage, string>();

  try {
    const [analysisSnap, inputSnap] = await Promise.all([analysisRef.get(), analysisRef.collection('inputs').doc('primary').get()]);
    const analysis = analysisSnap.data() as AnalysisDoc | undefined;
    const input = inputSnap.data() as AnalysisInputDoc | undefined;
    if (!analysis || !input || analysis.orgId !== job.orgId) throw new PipelineFailure('INTERNAL_ERROR', 'analysis or input missing');
    if (!input.text || input.text.trim().length < 3) throw new PipelineFailure('EMPTY_DOCUMENT');

    await analysisRef.update({ status: 'PROCESSING', error: null, updatedAt: nowIso() });
    await incrementMetrics({ analysesStarted: 1 });
    await writeAudit({ ...SYSTEM_ACTOR, action: 'ANALYSIS_PROCESSING_STARTED', orgId: analysis.orgId, analysisId: analysis.id, targetType: 'analysis', targetId: analysis.id, summary: `Processing attempt ${analysis.attempt} started.`, metadata: { reason: job.reason } });

    const [kb, ai] = await Promise.all([loadKnowledgeBase(), getAiClient()]);
    if (!kb.standards.length) throw new PipelineFailure('NO_RELEVANT_STANDARDS', 'knowledge base is empty');

    const output = await runPipeline(
      { analysisId: analysis.id, orgId: analysis.orgId, mode: analysis.inputMode, text: input.text, form: input.form },
      kb,
      ai,
      {
        onStage: async (stage, state, durationMs) => {
          const at = nowIso();
          if (state === 'RUNNING') {
            stageStarts.set(stage, at);
            await analysisRef.update(stageUpdate(stage, { state: 'RUNNING', startedAt: at }));
          } else {
            await analysisRef.update(stageUpdate(stage, { state, startedAt: stageStarts.get(stage) ?? at, finishedAt: at, ...(durationMs !== undefined ? { durationMs } : {}) }));
          }
        },
      },
    );

    const { result, graph, gaps, evidence, status } = output;
    await Promise.all([
      analysisRef.collection('results').doc('current').set(result),
      analysisRef.collection('graph').doc('current').set({ ...graph, orgId: analysis.orgId, analysisId: analysis.id }),
      replaceSubcollection(analysis.id, 'gaps', gaps as (SpecificationGap & { id: string })[], analysis.orgId),
      replaceSubcollection(analysis.id, 'evidence', evidence as (EvidenceItem & { id: string })[], analysis.orgId),
    ]);

    const productName = analysis.productName || result.specification.productName;
    await analysisRef.update({
      status,
      currentStage: null,
      summary: result.summary,
      aiMode: result.trace.aiMode,
      detectedLanguage: result.specification.language.detected,
      productName,
      completedAt: nowIso(),
      updatedAt: nowIso(),
      reviewStatus: status === 'REVIEW_REQUIRED' ? 'PENDING' : analysis.reviewStatus,
    });

    if (status === 'REVIEW_REQUIRED') {
      const taskRef = db.collection('reviewTasks').doc();
      await taskRef.set({
        id: taskRef.id,
        orgId: analysis.orgId,
        analysisId: analysis.id,
        analysisTitle: analysis.title,
        reason: result.abstention.reasons.join(' ') || 'Insufficient evidence for a reliable recommendation.',
        trigger: 'ABSTENTION',
        status: 'OPEN',
        requestedBy: 'system',
        requestedByName: 'FiiSpec pipeline',
        assignedTo: null,
        assignedToName: null,
        decisionNote: null,
        decidedBy: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    const aiCalls = result.trace.aiCalls;
    await incrementMetrics({
      analysesCompleted: status === 'COMPLETED' ? 1 : 0,
      analysesReviewRequired: status === 'REVIEW_REQUIRED' ? 1 : 0,
      aiRequests: aiCalls.length,
      aiFailures: aiCalls.filter((c) => !c.ok).length,
      aiLatencyMsTotal: aiCalls.reduce((s, c) => s + c.latencyMs, 0),
      pipelineLatencyMsTotal: Date.now() - started,
    });
    await writeAudit({
      ...SYSTEM_ACTOR,
      action: status === 'COMPLETED' ? 'ANALYSIS_COMPLETED' : 'ANALYSIS_REVIEW_REQUIRED',
      orgId: analysis.orgId,
      analysisId: analysis.id,
      targetType: 'analysis',
      targetId: analysis.id,
      summary:
        status === 'COMPLETED'
          ? `Analysis completed: ${result.summary.standardsIdentified} standards identified, ${result.summary.gaps} gaps, readiness ${result.summary.readinessScore}.`
          : 'Insufficient evidence — analysis sent for human review.',
      metadata: { aiMode: result.trace.aiMode, durationMs: Date.now() - started, recommendations: result.recommendations.length },
    });
    await db.collection('analysisJobs').doc(jobId).update({ status: 'DONE', finishedAt: nowIso() });
    log.info('analysis.completed', { analysisId: analysis.id, status, durationMs: Date.now() - started, aiMode: result.trace.aiMode });
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'INTERNAL_ERROR';
    log.error('analysis.failed', error, { analysisId: job.analysisId, code });
    const failedStage = [...stageStarts.keys()].pop();
    await analysisRef.update({
      status: 'FAILED',
      error: analysisError(code),
      currentStage: null,
      updatedAt: nowIso(),
      ...(failedStage ? { [`stages.${failedStage}`]: { state: 'FAILED', startedAt: stageStarts.get(failedStage), finishedAt: nowIso() } } : {}),
    }).catch((e: unknown) => log.error('analysis.failure_update_failed', e, { analysisId: job.analysisId }));
    await db.collection('analysisJobs').doc(jobId).update({ status: 'FAILED', finishedAt: nowIso() }).catch(() => undefined);
    await incrementMetrics({ analysesFailed: 1 });
    await writeAudit({ ...SYSTEM_ACTOR, action: 'ANALYSIS_FAILED', orgId: job.orgId, analysisId: job.analysisId, targetType: 'analysis', targetId: job.analysisId, summary: `Processing failed (${code}).`, metadata: { code } }).catch(() => undefined);
  }
}

export const onAnalysisJobCreated = onDocumentCreated(
  { document: 'analysisJobs/{jobId}', region: FUNCTIONS_REGION, timeoutSeconds: 540, memory: '1GiB', secrets: [ANTHROPIC_API_KEY], retry: false },
  async (event) => {
    await processAnalysisJob(event.params.jobId);
  },
);
