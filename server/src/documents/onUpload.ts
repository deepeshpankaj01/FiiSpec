import type { AnalysisDoc, AnalysisInputDoc } from '../../../shared/analysis';
import { MAX_UPLOAD_BYTES } from '../../../shared/constants';
import { composeInputText } from '../analysis/create';
import { enqueueAnalysisJob } from '../analysis/jobs';
import { db, nowIso } from '../lib/admin';
import { SYSTEM_ACTOR, writeAudit } from '../lib/audit';
import type { OrgCaller } from '../lib/auth';
import { assertSameOrg } from '../lib/auth';
import { PipelineFailure, analysisError } from '../lib/errors';
import { log } from '../lib/log';
import { incrementMetrics } from '../lib/metrics';
import { HttpsError, runInBackground } from '../lib/runtime';
import { extractDocument } from './extract';

export interface UploadedDocument {
  buffer: Buffer;
  contentType: string;
}

/**
 * Accepts the tender document for an analysis created in DOCUMENT mode, then
 * reads it and queues the pipeline in the background. The document itself is
 * not retained: only the extracted text and metadata are stored.
 *
 * The same checks the Storage rules used to enforce apply: the caller created
 * the analysis in their organisation, it is still awaiting its upload, and the
 * file is a PDF/DOCX within the size limit matching what was declared.
 */
export async function acceptUploadedDocument(caller: OrgCaller, analysisId: string, upload: UploadedDocument): Promise<void> {
  if (upload.buffer.length === 0 || upload.buffer.length > MAX_UPLOAD_BYTES) throw new HttpsError('invalid-argument', 'The file is empty or larger than the upload limit.');
  const analysisRef = db.collection('analyses').doc(analysisId);
  const now = nowIso();
  // Transactional, so a second upload for the same analysis is rejected rather than read twice.
  const analysis = await db.runTransaction(async (tx) => {
    const current = (await tx.get(analysisRef)).data() as AnalysisDoc | undefined;
    assertSameOrg(caller, current?.orgId);
    if (!current || current.createdBy !== caller.uid) throw new HttpsError('not-found', 'Analysis not found.');
    if (current.status !== 'AWAITING_UPLOAD' || !current.file) throw new HttpsError('failed-precondition', 'This analysis is not waiting for a document.');
    if (upload.contentType !== current.file.contentType) throw new HttpsError('invalid-argument', 'The file type does not match the analysis.');
    tx.update(analysisRef, {
      'stages.UPLOADING': { state: 'DONE', startedAt: current.stages.UPLOADING?.startedAt ?? now, finishedAt: now },
      'stages.READING_DOCUMENT': { state: 'RUNNING', startedAt: now },
      currentStage: 'READING_DOCUMENT',
      status: 'PROCESSING',
      updatedAt: now,
    });
    return { ...current, file: current.file };
  });
  runInBackground(() => readDocument(analysis, upload, now));
}

async function readDocument(analysis: AnalysisDoc & { file: NonNullable<AnalysisDoc['file']> }, upload: UploadedDocument, now: string): Promise<void> {
  const analysisRef = db.collection('analyses').doc(analysis.id);
  try {
    const extraction = await extractDocument(upload.buffer, upload.contentType);
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
      targetId: analysis.file.storagePath,
      summary: `Document read: ${extraction.method === 'PDF_TEXT' ? `${extraction.pageCount ?? '?'} page PDF` : 'DOCX'}, ${extraction.text.length.toLocaleString('en-IN')} characters.`,
      metadata: { sizeBytes: upload.buffer.length, contentHash: extraction.contentHash, truncated: extraction.truncated },
    });
    await incrementMetrics({ documentsProcessed: 1 });
    await enqueueAnalysisJob(analysis.id, analysis.orgId, 'UPLOAD');
  } catch (error) {
    const code = error instanceof PipelineFailure ? error.code : 'INTERNAL_ERROR';
    log.error('upload.processing_failed', error, { analysisId: analysis.id, code });
    await analysisRef
      .update({
        status: 'FAILED',
        error: analysisError(code),
        currentStage: null,
        'stages.READING_DOCUMENT': { state: 'FAILED', startedAt: now, finishedAt: nowIso() },
        updatedAt: nowIso(),
      })
      .catch((e: unknown) => log.error('upload.failure_update_failed', e, { analysisId: analysis.id }));
    await incrementMetrics({ documentFailures: 1 });
    await writeAudit({ ...SYSTEM_ACTOR, action: 'ANALYSIS_FAILED', orgId: analysis.orgId, analysisId: analysis.id, targetType: 'document', targetId: analysis.file.storagePath, summary: `Document could not be processed (${code}).`, metadata: { code } }).catch(() => undefined);
  }
}
