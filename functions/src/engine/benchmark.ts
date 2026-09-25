/**
 * Benchmark evaluation. Runs the real pipeline on curated benchmark cases and
 * measures how well its output matches the case expectations. These metrics
 * describe agreement with a small curated benchmark only — they are not
 * accuracy claims about BIS coverage.
 */
import type { BenchmarkCase, KnowledgeBase } from '../../../shared/knowledge';
import type { AiClient } from '../ai/types';
import { runPipeline } from './pipeline';

export interface CaseResult {
  caseId: string;
  title: string;
  primaryHit: boolean;
  standardRecall: number;
  standardPrecision: number;
  gapRecall: number | null;
  abstentionCorrect: boolean;
  abstained: boolean;
  recommendedIds: string[];
  missingExpected: string[];
  unexpected: string[];
  missingGapCodes: string[];
  durationMs: number;
}

export interface BenchmarkSummary {
  cases: number;
  primaryHitRate: number;
  meanStandardRecall: number;
  meanStandardPrecision: number;
  meanGapRecall: number | null;
  abstentionAccuracy: number;
  aiMode: 'AI_ASSISTED' | 'DETERMINISTIC_ONLY';
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function evaluateCase(c: BenchmarkCase, kb: KnowledgeBase, ai: AiClient | null): Promise<CaseResult> {
  const started = Date.now();
  const out = await runPipeline(
    {
      analysisId: `benchmark-${c.id}`,
      orgId: 'benchmark',
      mode: c.inputMode,
      text: c.inputText,
      form: c.inputMode === 'DESCRIPTION' ? { description: c.inputText } : { technicalSpecification: c.inputText },
    },
    kb,
    ai,
  );
  const recs = out.result.recommendations.filter((r) => !r.reviewRequired);
  const recommendedIds = recs.map((r) => r.standardId);
  const primaryIds = recs.filter((r) => r.tier === 'PRIMARY').map((r) => r.standardId);
  const expected = new Set(c.expectedStandardIds);
  const found = recommendedIds.filter((id) => expected.has(id));
  const gapCodes = new Set(out.gaps.map((g) => g.code));
  const missingGapCodes = c.expectedGapCodes.filter((code) => !gapCodes.has(code));

  return {
    caseId: c.id,
    title: c.title,
    primaryHit: c.expectAbstention ? out.result.abstention.abstained : c.expectedPrimaryIds.some((id) => primaryIds.includes(id)),
    standardRecall: c.expectAbstention ? 1 : round3(found.length / Math.max(1, expected.size)),
    standardPrecision: c.expectAbstention ? (recommendedIds.length ? 0 : 1) : round3(found.length / Math.max(1, recommendedIds.length)),
    gapRecall: c.expectedGapCodes.length ? round3((c.expectedGapCodes.length - missingGapCodes.length) / c.expectedGapCodes.length) : null,
    abstentionCorrect: out.result.abstention.abstained === c.expectAbstention,
    abstained: out.result.abstention.abstained,
    recommendedIds,
    // For abstention cases the expected ids are schema placeholders; any confirmed recommendation is unexpected.
    missingExpected: c.expectAbstention ? [] : c.expectedStandardIds.filter((id) => !recommendedIds.includes(id)),
    unexpected: c.expectAbstention ? recommendedIds : recommendedIds.filter((id) => !expected.has(id)),
    missingGapCodes,
    durationMs: Date.now() - started,
  };
}

export function summarize(results: CaseResult[], aiMode: BenchmarkSummary['aiMode']): BenchmarkSummary {
  const n = Math.max(1, results.length);
  const gapScores = results.map((r) => r.gapRecall).filter((x): x is number => x !== null);
  return {
    cases: results.length,
    primaryHitRate: round3(results.filter((r) => r.primaryHit).length / n),
    meanStandardRecall: round3(results.reduce((s, r) => s + r.standardRecall, 0) / n),
    meanStandardPrecision: round3(results.reduce((s, r) => s + r.standardPrecision, 0) / n),
    meanGapRecall: gapScores.length ? round3(gapScores.reduce((s, x) => s + x, 0) / gapScores.length) : null,
    abstentionAccuracy: round3(results.filter((r) => r.abstentionCorrect).length / n),
    aiMode,
  };
}
