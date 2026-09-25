import { describe, expect, it } from 'vitest';
import type { AnalysisDoc } from '../../../shared/analysis';
import { SPEC_SECTION_KEYS } from '../../../shared/analysis';
import { runPipeline } from '../../src/engine/pipeline';
import { applyAiDraft, baseNumbersOf, buildDeterministicDraft, validateAiDraft } from '../../src/engine/specgen';
import { renderDocx } from '../../src/reports/docx';
import { pickSpecification } from '../../src/reports/export';
import { buildReportModel } from '../../src/reports/model';
import { renderPdf, sanitizePdfText } from '../../src/reports/pdf';
import { reconcileOrigins } from '../../src/workflow/specification';
import { seedKnowledgeBase } from '../../src/seed';

const kb = seedKnowledgeBase();

async function evCharger() {
  const text = '11 kW outdoor AC EV charger for public charging.';
  return runPipeline({ analysisId: 'a', orgId: 'o', mode: 'DESCRIPTION', text, form: { description: text } }, kb, null);
}

describe('procurement specification generation', () => {
  it('produces all ten sections with placeholders for missing parameters', async () => {
    const out = await evCharger();
    const sections = buildDeterministicDraft({ result: out.result, gaps: out.gaps });
    expect(sections.map((s) => s.key)).toEqual([...SPEC_SECTION_KEYS]);
    const technical = sections.find((s) => s.key === 'technical_requirements')!;
    expect(technical.items.some((i) => i.origin === 'GAP_PLACEHOLDER' && /Supply voltage/.test(i.text))).toBe(true);
    const standards = sections.find((s) => s.key === 'applicable_standards')!;
    expect(standards.items[0]!.text).toMatch(/IS 17017 \(Part 1\).*latest edition including all amendments/);
    expect(sections.find((s) => s.key === 'certification_considerations')!.items.every((i) => /verif|Not detected|confirm/i.test(i.text))).toBe(true);
  });

  it('rejects AI drafts that cite standards outside the recommended set', async () => {
    const out = await evCharger();
    const allowed = baseNumbersOf(out.result.recommendations);
    const bad = validateAiDraft({ productDefinition: 'Supply of EV chargers conforming to IS 99999.', technicalRequirements: ['Rated power 11 kW.'] }, allowed, 0);
    expect(bad.ok).toBe(false);
    const good = validateAiDraft({ productDefinition: 'Supply of AC EV charging stations conforming to IS 17017 (Part 1).', technicalRequirements: ['Rated output power: 11 kW.'] }, allowed, 0);
    expect(good.ok).toBe(true);
  });

  it('rejects AI drafts that drop purchaser placeholders', () => {
    const r = validateAiDraft({ productDefinition: 'Supply of chargers.', technicalRequirements: ['Supply voltage 415 V.'] }, new Set(), 1);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/placeholders/) });
  });

  it('applies accepted AI wording only to the two prose sections', async () => {
    const out = await evCharger();
    const sections = buildDeterministicDraft({ result: out.result, gaps: out.gaps });
    const applied = applyAiDraft(sections, { productDefinition: 'Supply of outdoor AC charging stations.', technicalRequirements: ['[To be specified by purchaser: supply voltage]', 'Rated output power: 11 kW.'] });
    expect(applied.find((s) => s.key === 'technical_requirements')!.items.map((i) => i.origin)).toEqual(['GAP_PLACEHOLDER', 'AI_DRAFT']);
    expect(applied.find((s) => s.key === 'applicable_standards')).toEqual(sections.find((s) => s.key === 'applicable_standards'));
  });

  it('labels any changed text as a human edit when saving', () => {
    const stored = [{ key: 'product_definition' as const, title: 't', items: [{ text: 'Original', origin: 'KNOWLEDGE_BASE' as const, standardIds: [] }] }];
    const incoming = [{ key: 'product_definition' as const, title: 't', items: [{ text: 'Original', origin: 'KNOWLEDGE_BASE' as const, standardIds: [] }, { text: 'Claimed KB text', origin: 'KNOWLEDGE_BASE' as const, standardIds: [] }] }];
    expect(reconcileOrigins(incoming, stored)[0]!.items.map((i) => i.origin)).toEqual(['KNOWLEDGE_BASE', 'HUMAN_EDIT']);
  });

  it('prefers the latest human-reviewed specification for export', () => {
    const spec = (version: number, status: 'AI_DRAFT' | 'HUMAN_REVIEWED') => ({ version, status }) as never;
    expect(pickSpecification([spec(1, 'HUMAN_REVIEWED'), spec(2, 'AI_DRAFT')])).toMatchObject({ version: 1 });
    expect(pickSpecification([spec(1, 'AI_DRAFT'), spec(2, 'AI_DRAFT')])).toMatchObject({ version: 2 });
    expect(pickSpecification([])).toBeNull();
  });
});

describe('report rendering', () => {
  it('renders valid PDF and DOCX files including the disclaimer', async () => {
    const out = await evCharger();
    const now = new Date().toISOString();
    const analysis = { id: 'a', orgId: 'o', title: 'EV charger', createdByName: 'Tester', status: 'COMPLETED', createdAt: now, completedAt: now } as AnalysisDoc;
    const model = buildReportModel({ analysis, result: out.result, gaps: out.gaps, evidence: out.evidence, specification: null, generatedAt: now });
    expect(model.disclaimer).toMatch(/decision-support tool/);
    const pdf = await renderPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const docx = await renderDocx(model);
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
  });

  it('sanitises characters the standard PDF fonts cannot render', () => {
    expect(sanitizePdfText('HP → kW, ≥ 95 %')).toBe('HP -> kW, >= 95 %');
    expect(sanitizePdfText('चार्जर 22 kW')).toMatch(/\[non-Latin text — see DOCX export\] 22 kW/);
  });
});
