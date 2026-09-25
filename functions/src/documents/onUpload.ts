import { onObjectFinalized } from 'firebase-functions/storage';
import type { AnalysisDoc, AnalysisInputDoc } from '../../../shared/analysis';
import { composeInputText } from '../analysis/create';
import { enqueueAnalysisJob } from '../analysis/jobs';
import { bucket, db, nowIso } from '../lib/admin';
import { SYSTEM_ACTOR, writeAudit } from '../lib/audit';
import { FUNCTIONS_REGION } from '../lib/config';
import { PipelineFailure, analysisError } from '../lib/errors';
import { log } from '../lib/log';
import { incrementMetrics } from '../lib/metrics';
import { extractDocument } from './extract';

const INPUT_PATH = /^organizations\/([^/]+)\/analyses\/([^/]+)\/input\/[^/]+$/;

export function parseInputPath(path: string): { orgId: string; analysisId: string } | null {
  const m = INPUT_PATH.exec(path);
  return m ? { orgId: m[1]!, analysisId: m[2]! } : null;
}

export const onInputDocumentUploaded = onObjectFinalized({ region: FUNCTIONS_REGION, memory: '1GiB', timeoutSeconds: 300 }, async (event) => {
  const object = event.data;
  const parsed = parseInputPath(object.name);
  if (!parsed) return; // exports and other paths are ignored

  const analysisRef = db.collection('analyses').doc(parsed.analysisId);
  const snap = await analysisRef.get();
  const analysis = snap.data() as AnalysisDoc | undefined;
  const file = bucket().file(object.name);

  // The upload must match the analysis record created by createAnalysis.
  if (!analysis || analysis.orgId !== parsed.orgId || analysis.status !== 'AWAITING_UPLOAD' || analysis.file?.storagePath !== object.name) {
    log.warn('upload.rejected_unexpected_object', { analysisId: parsed.analysisId });
    await file.delete({ ignoreNotFound: true });
    return;
  }

  const now = nowIso();
  await analysisRef.update({
    'stages.UPLOADING': { state: 'DONE', startedAt: analysis.stages.UPLOADING?.startedAt ?? now, finishedAt: now },
    'stages.READING_DOCUMENT': { state: 'RUNNING', startedAt: now },
    currentStage: 'READING_DOCUMENT',
    status: 'PROCESSING',
    updatedAt: now,
  });

  try {
    const [buffer] = await file.download();
    const extraction = await extractDocument(buffer, object.contentType ?? analysis.file.contentType);
    const inputRef = analysisRef.collection('inputs').doc('primary');
    const inputSnap = await inputRef.get();
    const input = inputSnap.data() as AnalysisInputDoc | undefined;
    const formText = input ? composeInputText({ mode: 'SPECIFICATION', form: { ...input.form, technicalSpecification: '' } }) : '';

    await inputRef.set(
      {
        text: [formText, extraction.text].filter(Boolean).join('\n\n'),
        truncated: extraction.truncated,
        document: {
          pageCount: extraction.pageCount,
          method: extraction.method,
          tables: extraction.tables.map((t) => ({ rows: t.map((r) => ({ cells: r })) })),
          warnings: extraction.warnings,
          contentHash: extraction.contentHash,
        },
      },
      { merge: true },
    );
    const finished = nowIso();
    await analysisRef.update({
      'stages.READING_DOCUMENT': { state: 'DONE', startedAt: now, finishedAt: finished },
      status: 'QUEUED',
      updatedAt: finished,
    });
    await writeAudit({
      ...SYSTEM_ACTOR,
      action: 'DOCUMENT_UPLOADED',
      orgId: analysis.orgId,
      analysisId: analysis.id,
      targetType: 'document',
      targetId: object.name,
      summary: `Document read: ${extraction.method === 'PDF_TEXT' ? `${extraction.pageCount ?? '?'} page PDF` : 'DOCX'}, ${extraction.text.length.toLocaleString('en-IN')} characters.`,
      metadata: { sizeBytes: Number(object.size), contentHash: extraction.contentHash, truncated: extraction.truncated },
    });
    await incrementMetrics({ documentsProcessed: 1 });
    await enqueueAnalysisJob(analysis.id, analysis.orgId, 'UPLOAD');
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'INTERNAL_ERROR';
    log.error('upload.processing_failed', error, { analysisId: analysis.id, code });
    if (code === 'INVALID_FILE' || code === 'UNSUPPORTED_FORMAT') await file.delete({ ignoreNotFound: true });
    await analysisRef.update({
      status: 'FAILED',
      error: analysisError(code),
      currentStage: null,
      'stages.READING_DOCUMENT': { state: 'FAILED', startedAt: now, finishedAt: nowIso() },
      updatedAt: nowIso(),
    });
    await incrementMetrics({ documentFailures: 1 });
    await writeAudit({ ...SYSTEM_ACTOR, action: 'ANALYSIS_FAILED', orgId: analysis.orgId, analysisId: analysis.id, targetType: 'document', targetId: object.name, summary: `Document could not be processed (${code}).`, metadata: { code } });
  }
});
