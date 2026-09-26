import { HttpsError, onCall } from '../lib/runtime';
import type { AnalysisDoc, AnalysisResultDoc, EvidenceItem, GeneratedSpecificationDoc, SpecificationGap } from '../../../shared/analysis';
import { ExportReportSchema } from '../../../shared/api';
import { db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { assertSameOrg, callerFrom, requirePermission } from '../lib/auth';
import { parseRequest } from '../lib/errors';
import { incrementMetrics } from '../lib/metrics';
import { enforceRateLimit } from '../lib/rateLimit';
import { renderDocx } from './docx';
import { buildReportModel } from './model';
import { renderPdf } from './pdf';

const MIME = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/** Prefer the latest human-reviewed specification, otherwise the latest draft. */
export function pickSpecification(specs: GeneratedSpecificationDoc[]): GeneratedSpecificationDoc | null {
  const sorted = [...specs].sort((a, b) => b.version - a.version);
  return sorted.find((s) => s.status === 'HUMAN_REVIEWED') ?? sorted[0] ?? null;
}

export const exportReport = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'exportReport');
  const req = parseRequest(ExportReportSchema, request.data);
  await enforceRateLimit(caller.uid, 'exportReport');
  const analysisRef = db.collection('analyses').doc(req.analysisId);
  const analysis = (await analysisRef.get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  const [resultSnap, gapsSnap, evidenceSnap, specsSnap] = await Promise.all([
    analysisRef.collection('results').doc('current').get(),
    analysisRef.collection('gaps').get(),
    analysisRef.collection('evidence').get(),
    analysisRef.collection('specifications').get(),
  ]);
  const result = resultSnap.data() as AnalysisResultDoc | undefined;
  if (!analysis || !result) throw new HttpsError('failed-precondition', 'The analysis has no results to export yet.');

  const generatedAt = nowIso();
  const model = buildReportModel({
    analysis,
    result,
    gaps: gapsSnap.docs.map((d) => d.data() as SpecificationGap),
    evidence: evidenceSnap.docs.map((d) => d.data() as EvidenceItem),
    specification: pickSpecification(specsSnap.docs.map((d) => d.data() as GeneratedSpecificationDoc)),
    generatedAt,
  });
  const buffer = req.format === 'PDF' ? await renderPdf(model) : await renderDocx(model);
  const extension = req.format === 'PDF' ? 'pdf' : 'docx';
  const fileName = `FiiSpec-${analysis.id}-${generatedAt.slice(0, 10)}.${extension}`;

  // The report is returned directly to the caller; only a record of the export is kept.
  const exportRef = analysisRef.collection('exports').doc();
  await exportRef.set({ id: exportRef.id, orgId: analysis.orgId, analysisId: analysis.id, format: req.format, fileName, sizeBytes: buffer.length, createdBy: caller.uid, createdByName: caller.name, createdAt: generatedAt });
  await incrementMetrics({ reportsExported: 1 });
  await writeAudit({
    action: 'REPORT_EXPORTED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    analysisId: analysis.id,
    targetType: 'export',
    targetId: exportRef.id,
    summary: `${req.format} report exported (${Math.round(buffer.length / 1024)} KB).`,
    metadata: { format: req.format, sizeBytes: buffer.length },
  });
  return { fileName, mimeType: MIME[req.format], contentBase64: buffer.toString('base64') };
});
