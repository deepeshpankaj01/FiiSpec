/**
 * Runs the pipeline over the benchmark cases against the local seed dataset.
 * Usage: npx tsx scripts/run-benchmarks.ts [--verbose] [--ai]
 * --ai uses ANTHROPIC_API_KEY from the environment (costs money; off by default).
 */
import { AnthropicAiClient } from '../src/ai/anthropic';
import { evaluateCase, summarize } from '../src/engine/benchmark';
import { runPipeline } from '../src/engine/pipeline';
import { seedKnowledgeBase, validatedSeed } from '../src/seed';

const verbose = process.argv.includes('--verbose');
const useAi = process.argv.includes('--ai');
const kb = seedKnowledgeBase();
const { benchmarkCases } = validatedSeed();
const ai = useAi && process.env.ANTHROPIC_API_KEY ? new AnthropicAiClient(process.env.ANTHROPIC_API_KEY) : null;

const results = [];
for (const c of benchmarkCases) {
  const r = await evaluateCase(c, kb, ai);
  results.push(r);
  console.log(
    `${r.primaryHit ? 'PASS' : 'FAIL'}  ${c.id.padEnd(24)} recall=${r.standardRecall.toFixed(2)} precision=${r.standardPrecision.toFixed(2)} gapRecall=${r.gapRecall ?? '—'} abstained=${r.abstained}`,
  );
  if (verbose) {
    const out = await runPipeline(
      { analysisId: c.id, orgId: 'cli', mode: c.inputMode, text: c.inputText, form: c.inputMode === 'DESCRIPTION' ? { description: c.inputText } : { technicalSpecification: c.inputText } },
      kb,
      ai,
    );
    const spec = out.result.specification;
    console.log(`   category=${spec.productCategoryId} (${spec.categoryConfidence}) lang=${spec.language.detected} params=${spec.technicalParameters.map((p) => `${p.kind}:${p.rawText}`).join(' | ')}`);
    for (const rec of out.result.recommendations) {
      console.log(`   ${rec.tier.padEnd(7)} ${rec.designation.padEnd(34)} score=${String(rec.score).padStart(3)} ${rec.confidence.padEnd(15)} ${rec.relationship?.type ?? ''}`);
    }
    for (const v of out.result.versionFindings.filter((f) => f.origin === 'INPUT_REFERENCE')) console.log(`   VERSION ${v.citedAs} → ${v.state}`);
    for (const f of out.result.certificationFindings) console.log(`   CERT ${f.classification.padEnd(22)} ${f.title}`);
    for (const g of out.gaps) console.log(`   GAP ${g.severity.padEnd(8)} ${g.code}`);
    console.log(`   readiness=${out.result.readiness.score} (${out.result.readiness.label}) abstained=${out.result.abstention.abstained}`);
    if (r.missingExpected.length) console.log(`   missing expected: ${r.missingExpected.join(', ')}`);
    if (r.missingGapCodes.length) console.log(`   missing gap codes: ${r.missingGapCodes.join(', ')}`);
  }
}
console.log('\nSummary:', JSON.stringify(summarize(results, ai ? 'AI_ASSISTED' : 'DETERMINISTIC_ONLY'), null, 2));
