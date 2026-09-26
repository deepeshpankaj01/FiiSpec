import { describe, expect, it } from 'vitest';
import type { AiClient, AiResult, PromptDefinition } from '../../src/ai/types';
import { runPipeline } from '../../src/engine/pipeline';
import { seedKnowledgeBase } from '../../src/seed';

const kb = seedKnowledgeBase();
const input = (text: string) => ({ analysisId: 'a1', orgId: 'o1', mode: 'DESCRIPTION' as const, text, form: { description: text } });

/** Scripted fake model: returns canned outputs per prompt id, including deliberately hallucinated content. */
class ScriptedAi implements AiClient {
  readonly model = 'fake-model';
  calls: string[] = [];
  constructor(private readonly script: Record<string, unknown>) {}
  async generate<TInput, TOutput>(prompt: PromptDefinition<TInput, TOutput>): Promise<AiResult<TOutput>> {
    this.calls.push(prompt.id);
    const output = this.script[prompt.id];
    if (output === undefined) return { ok: false, error: 'not scripted', latencyMs: 1, model: this.model };
    const parsed = prompt.schema.safeParse(output);
    if (!parsed.success) return { ok: false, error: 'schema', latencyMs: 1, model: this.model };
    return { ok: true, data: parsed.data, latencyMs: 1, model: this.model };
  }
}

class FailingAi implements AiClient {
  readonly model = 'down';
  async generate<TInput, TOutput>(_prompt: PromptDefinition<TInput, TOutput>): Promise<AiResult<TOutput>> {
    return { ok: false, error: 'AI service unreachable', latencyMs: 5, model: this.model };
  }
}

describe('end-to-end pipeline (deterministic)', () => {
  it('produces the EV charger blueprint with evidence for every recommendation', async () => {
    const stages: string[] = [];
    const out = await runPipeline(input('11 kW outdoor AC EV charger for public charging.'), kb, null, { onStage: (s, state) => void stages.push(`${s}:${state}`) });
    const primary = out.result.recommendations.filter((r) => r.tier === 'PRIMARY');
    expect(primary.map((p) => p.standardId)).toEqual(['is-17017-1']);
    expect(primary[0]!.confidence).toBe('HIGH');
    expect(out.result.recommendations.every((r) => r.evidenceIds.length > 0)).toBe(true);
    expect(out.evidence.every((e) => ['VERIFIED_OFFICIAL', 'CURATED_BENCHMARK', 'AI_INTERPRETATION', 'HUMAN_REVIEW_REQUIRED'].includes(e.provenanceClass))).toBe(true);
    expect(out.result.trace.aiMode).toBe('DETERMINISTIC_ONLY');
    expect(out.status).toBe('COMPLETED');
    expect(stages).toEqual(['UNDERSTANDING', 'RETRIEVING', 'RELATIONSHIPS', 'VERSIONS', 'CERTIFICATION', 'GAPS', 'REPORT'].flatMap((s) => [`${s}:RUNNING`, `${s}:DONE`]));
    // Nothing in the curated dataset is verified, so no version may be claimed as current.
    expect(out.result.versionFindings.some((v) => v.state === 'CURRENT_VERIFIED')).toBe(false);
  });

  it('builds a graph whose edges all carry provenance and reference existing nodes', async () => {
    const { graph } = await runPipeline(input('60 kW DC fast charger, CCS2, public charging station'), kb, null);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(graph.edges.length).toBeGreaterThan(5);
    for (const e of graph.edges) {
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
      expect(e.statement.length).toBeGreaterThan(10);
    }
  });

  it('abstains instead of guessing when no indexed standard applies', async () => {
    const out = await runPipeline(input('Supply of ergonomic office chairs with mesh back and armrests'), kb, null);
    expect(out.status).toBe('REVIEW_REQUIRED');
    expect(out.result.abstention.abstained).toBe(true);
    expect(out.result.abstention.message).toBe('FiiSpec could not establish sufficient evidence for a reliable recommendation.');
    expect(out.result.recommendations.every((r) => r.reviewRequired)).toBe(true);
  });
});

describe('AI safety guards', () => {
  it('discards invented standards, out-of-taxonomy categories and ungrounded parameters', async () => {
    const ai = new ScriptedAi({
      'spec-extraction': {
        detectedLanguage: 'hi-Latn',
        normalizedSummaryEnglish: 'I need to prepare a tender for an 11 kW EV charger for public charging.',
        productName: 'EV charger',
        productCategoryId: 'quantum-charger', // not in taxonomy
        categoryReason: 'made up',
        intendedUse: 'public charging',
        environmentSetting: 'UNSPECIFIED',
        environmentConditions: [],
        materials: [],
        capacity: null,
        installationContext: null,
        procurementContext: null,
        safetyRequirements: [],
        parameters: [
          { kind: 'POWER', label: 'Power', value: 11, valueMax: null, unit: 'kW', textValue: null, sourceText: '11 kW' },
          { kind: 'IP_RATING', label: 'IP', value: null, valueMax: null, unit: null, textValue: 'IP67', sourceText: 'IP67 enclosure' }, // not in input
        ],
        missingInformation: ['Connector type'],
        uncertainFields: [],
      },
      'standard-relevance': {
        assessments: [
          { candidateId: 'is-17017-1', relevance: 0.95, role: 'PRIMARY_PRODUCT', rationale: 'Scope covers conductive EV charging systems.' },
          { candidateId: 'is-99999-fake', relevance: 1, role: 'PRIMARY_PRODUCT', rationale: 'Invented standard.' },
        ],
      },
    });
    const out = await runPipeline(input('Mujhe public charging ke liye 11 kW EV charger ka tender banana hai.'), kb, ai);
    const ids = out.result.recommendations.map((r) => r.standardId);
    expect(ids).not.toContain('is-99999-fake');
    expect(ids[0]).toBe('is-17017-1');
    expect(out.result.specification.productCategoryId).not.toBe('quantum-charger');
    expect(out.result.specification.technicalParameters.some((p) => p.textValue === 'IP67')).toBe(false);
    expect(out.result.trace.warnings.join(' ')).toMatch(/outside the taxonomy/);
    expect(out.result.trace.warnings.join(' ')).toMatch(/discarded because their source text was not found/);
    expect(out.result.specification.language.normalization).toBe('AI_NORMALIZED');
    expect(out.result.recommendations[0]!.aiAssessment?.rationale).toMatch(/conductive/);
  });

  it('keeps AI gap issues only when their quote exists verbatim in the input', async () => {
    const ai = new ScriptedAi({
      'gap-analysis': {
        issues: [
          { category: 'AMBIGUOUS_REQUIREMENT', severity: 'WARNING', quote: 'suitable for heavy traffic areas', issue: 'Vague', whyItMatters: 'x', suggestion: 'y' },
          { category: 'AMBIGUOUS_REQUIREMENT', severity: 'WARNING', quote: 'charger must be fast', issue: 'Not in text', whyItMatters: 'x', suggestion: 'y' },
        ],
      },
    });
    const text = '22 kW AC EV charger with Type 2 socket, suitable for heavy traffic areas, IP55 enclosure, three phase 415 V supply.';
    const out = await runPipeline(input(text), kb, ai);
    const aiGaps = out.gaps.filter((g) => g.origin === 'AI');
    expect(aiGaps.map((g) => g.quote)).toEqual(['suitable for heavy traffic areas']);
  });

  it('falls back to deterministic analysis when every AI call fails', async () => {
    const out = await runPipeline(input('11 kW outdoor AC EV charger for public charging.'), kb, new FailingAi());
    expect(out.result.trace.aiMode).toBe('DETERMINISTIC_ONLY');
    expect(out.result.trace.aiCalls.length).toBeGreaterThan(0);
    expect(out.result.trace.aiCalls.every((c) => !c.ok)).toBe(true);
    expect(out.result.recommendations[0]!.standardId).toBe('is-17017-1');
    expect(out.result.trace.warnings.some((w) => /unavailable/.test(w))).toBe(true);
  });
});
