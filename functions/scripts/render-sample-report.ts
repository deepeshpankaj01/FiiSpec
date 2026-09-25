/**
 * Renders a sample PDF/DOCX report from a real (deterministic) pipeline run.
 * Usage: npx tsx scripts/render-sample-report.ts [caseId] [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalysisDoc, GeneratedSpecificationDoc } from '../../shared/analysis';
import { runPipeline } from '../src/engine/pipeline';
import { buildDeterministicDraft } from '../src/engine/specgen';
import { renderDocx } from '../src/reports/docx';
import { buildReportModel } from '../src/reports/model';
import { renderPdf } from '../src/reports/pdf';
import { seedKnowledgeBase, validatedSeed } from '../src/seed';

const caseId = process.argv[2] ?? 'ev-ac-public';
const outDir = process.argv[3] ?? join(process.cwd(), '..', '.tmp');
const kb = seedKnowledgeBase();
const c = validatedSeed().benchmarkCases.find((x) => x.id === caseId);
if (!c) throw new Error(`Unknown case ${caseId}`);

const out = await runPipeline(
  { analysisId: `sample-${c.id}`, orgId: 'sample', mode: c.inputMode, text: c.inputText, form: c.inputMode === 'DESCRIPTION' ? { description: c.inputText } : { technicalSpecification: c.inputText } },
  kb,
  null,
);
const now = new Date().toISOString();
const analysis: AnalysisDoc = {
  id: `sample-${c.id}`, orgId: 'sample', createdBy: 'cli', createdByName: 'Sample run', title: c.title, productName: out.result.specification.productName,
  inputMode: c.inputMode, status: out.status, currentStage: null, stages: {}, summary: out.result.summary, error: null, reviewStatus: 'NONE', specStatus: 'AI_DRAFT',
  aiMode: out.result.trace.aiMode, detectedLanguage: out.result.specification.language.detected, file: null, isDemo: true, benchmarkCaseId: c.id, attempt: 1,
  createdAt: now, updatedAt: now, completedAt: now,
};
const spec: GeneratedSpecificationDoc = {
  id: 'spec-1', analysisId: analysis.id, orgId: 'sample', version: 1, status: 'AI_DRAFT', sections: buildDeterministicDraft({ result: out.result, gaps: out.gaps }),
  generation: { method: 'DETERMINISTIC', promptVersion: null, aiRejectedReason: null }, createdBy: 'cli', createdAt: now, updatedAt: now,
  approvedBy: null, approvedByName: null, approvedAt: null, reviewNote: null,
};
const model = buildReportModel({ analysis, result: out.result, gaps: out.gaps, evidence: out.evidence, specification: spec, generatedAt: now });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${c.id}.pdf`), await renderPdf(model));
writeFileSync(join(outDir, `${c.id}.docx`), await renderDocx(model));
console.log(`Wrote ${join(outDir, `${c.id}.pdf`)} and .docx`);
