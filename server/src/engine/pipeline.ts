/**
 * The FiiSpec analysis pipeline (pure orchestration, no Firestore).
 *
 * Specification → Understanding → Retrieval → Scoring → Metadata filtering →
 * Relationship expansion → Version check → Certification → Gap analysis →
 * Evidence → Final ranking / abstention.
 *
 * The job runner (server/src/analysis/jobs.ts) persists
 * the output and reports stage progress through the hooks.
 */
import type {
  Abstention,
  AiRelevanceAssessment,
  AnalysisInputForm,
  AnalysisResultDoc,
  AnalysisSummary,
  EvidenceItem,
  PipelineTrace,
  SpecificationGap,
  StandardRecommendation,
  StandardsGraph,
} from '../../../shared/analysis';
import type { InputMode, PipelineStage } from '../../../shared/constants';
import { ABSTENTION_MESSAGE, PIPELINE_VERSION } from '../../../shared/constants';
import type { KnowledgeBase } from '../../../shared/knowledge';
import {
  certificationClassificationPrompt,
  gapAnalysisPrompt,
  relationshipExplanationPrompt,
  specExtractionPrompt,
  standardRelevancePrompt,
  versionReasoningPrompt,
} from '../ai/prompts';
import type { AiClient } from '../ai/types';
import { RecordingAiClient } from '../ai/types';
import { candidateRules, evaluateCertification } from './certification';
import { buildEvidence } from './evidence';
import { detectGaps } from './gaps';
import { buildGraph } from './graph';
import { needsNormalization, detectLanguage } from './language';
import { expandRelationships, rankPrimary, relationshipCounts } from './recommend';
import { bm25Search, buildIndex, buildQuery, retrieveCandidates, type Bm25Index } from './retrieval';
import { analysisTextFor, buildSpecification, categoryById } from './specification';
import { clamp01, normalizeText, truncate } from './text';
import { citationFindings, recommendationFindings } from './versions';

export interface PipelineInput {
  analysisId: string;
  orgId: string;
  mode: InputMode;
  text: string;
  form: AnalysisInputForm;
}

export interface PipelineHooks {
  onStage?: (stage: PipelineStage, state: 'RUNNING' | 'DONE' | 'SKIPPED', durationMs?: number) => Promise<void> | void;
}

export interface PipelineOutput {
  result: AnalysisResultDoc;
  graph: StandardsGraph;
  gaps: SpecificationGap[];
  evidence: EvidenceItem[];
  status: 'COMPLETED' | 'REVIEW_REQUIRED';
}

const indexCache = new WeakMap<KnowledgeBase, Bm25Index>();
function indexFor(kb: KnowledgeBase): Bm25Index {
  let index = indexCache.get(kb);
  if (!index) {
    index = buildIndex(kb);
    indexCache.set(kb, index);
  }
  return index;
}

export async function runPipeline(
  input: PipelineInput,
  kb: KnowledgeBase,
  aiClient: AiClient | null,
  hooks: PipelineHooks = {},
  now: Date = new Date(),
): Promise<PipelineOutput> {
  const ai = aiClient ? new RecordingAiClient(aiClient) : null;
  const warnings: string[] = [];
  const durations: Partial<Record<PipelineStage, number>> = {};

  async function stage<T>(name: PipelineStage, fn: () => Promise<T> | T): Promise<T> {
    const started = Date.now();
    await hooks.onStage?.(name, 'RUNNING');
    const value = await fn();
    durations[name] = Date.now() - started;
    await hooks.onStage?.(name, 'DONE', durations[name]);
    return value;
  }

  const text = normalizeText(input.text);

  // ---- Stage 1: Understanding ----------------------------------------------
  const { specification: spec, category, analysisText } = await stage('UNDERSTANDING', async () => {
    const lang = detectLanguage(text);
    let aiExtraction = null;
    if (ai) {
      const res = await ai.generate(specExtractionPrompt, {
        text: truncate(text, 60_000),
        productHint: input.form.product?.trim() || null,
        categories: kb.categories.filter((c) => c.lifecycle === 'PUBLISHED').map((c) => ({ id: c.id, label: c.label, description: c.description })),
      });
      if (res.ok) aiExtraction = res.data;
      else warnings.push(`AI specification understanding unavailable (${res.error}); deterministic extraction used.`);
    } else if (needsNormalization(lang)) {
      warnings.push('AI services are not configured; non-English input cannot be normalised.');
    }
    const built = buildSpecification(
      {
        text,
        productField: input.form.product ?? null,
        purposeField: input.form.purpose ?? null,
        procurementContextField: input.form.procurementContext ?? null,
        sectorHint: input.form.categoryHint || null,
      },
      kb.categories,
      aiExtraction,
    );
    warnings.push(...built.warnings);
    const cat = categoryById(kb.categories, built.specification.productCategoryId);
    return { specification: built.specification, category: cat, analysisText: analysisTextFor(built.specification, text) };
  });
  const textLower = analysisText.toLowerCase();

  // ---- Stages 2–4, 9: Retrieval, scoring, filtering, ranking -----------------
  const { primary, candidateCount, bm25ById } = await stage('RETRIEVING', async () => {
    const index = indexFor(kb);
    const query = buildQuery({ text: analysisText, productName: spec.productName, category, intendedUse: spec.intendedUse });
    const candidates = retrieveCandidates(kb, index, query, category);
    const bm25All = new Map(bm25Search(index, query, 1000).map((h) => [h.id, h.score]));

    const assessments = new Map<string, AiRelevanceAssessment>();
    if (ai && candidates.length) {
      const top = [...candidates].sort((a, b) => Number(b.viaMetadata) - Number(a.viaMetadata) || b.bm25 - a.bm25).slice(0, 10);
      const res = await ai.generate(standardRelevancePrompt, {
        requirementSummary: truncate(spec.normalizedSummary, 4000),
        productName: spec.productName,
        categoryLabel: spec.productCategoryLabel,
        candidates: top.map((c) => ({ candidateId: c.standard.id, designation: c.standard.standardNumber, title: c.standard.title, scope: c.standard.scope })),
      });
      if (res.ok) {
        const allowed = new Set(top.map((c) => c.standard.id));
        for (const a of res.data.assessments) {
          if (!allowed.has(a.candidateId)) continue; // never accept standards the retriever did not supply
          assessments.set(a.candidateId, { relevance: clamp01(a.relevance), role: a.role, rationale: truncate(a.rationale, 400), promptVersion: standardRelevancePrompt.version });
        }
      } else warnings.push(`AI relevance assessment unavailable (${res.error}); lexical relevance used.`);
    }
    const ranking = rankPrimary(candidates, spec, category, textLower, assessments, relationshipCounts(kb));
    return { primary: ranking.primary, candidateCount: candidates.length, bm25ById: bm25All };
  });

  // ---- Stage 5: Relationship expansion ---------------------------------------
  const { related, graph } = await stage('RELATIONSHIPS', async () => {
    const expansion = expandRelationships(primary, kb, spec, category, textLower, bm25ById);
    const g = buildGraph(spec, primary, expansion.related, expansion.edges, kb);
    for (const edge of g.edges) {
      if (edge.contextNote) {
        edge.explanation = edge.contextNote;
        edge.explanationOrigin = 'RULE';
      }
    }
    const explainable = g.edges.filter((e) => e.type !== 'APPLIES_TO' && e.type !== 'AMENDED_BY').slice(0, 20);
    if (ai && explainable.length) {
      const nodeLabel = new Map(g.nodes.map((n) => [n.id, n]));
      const res = await ai.generate(relationshipExplanationPrompt, {
        productSummary: truncate(spec.normalizedSummary, 1500),
        edges: explainable.map((e) => ({
          edgeId: e.id,
          from: nodeLabel.get(e.source)?.label ?? e.source,
          to: nodeLabel.get(e.target)?.label ?? e.target,
          toTitle: nodeLabel.get(e.target)?.title ?? '',
          type: e.type,
          provenance: e.statement,
        })),
      });
      if (res.ok) {
        const byId = new Map(res.data.explanations.map((x) => [x.edgeId, x.explanation]));
        for (const edge of explainable) {
          const explanation = byId.get(edge.id);
          if (explanation) {
            edge.explanation = truncate(explanation, 400);
            edge.explanationOrigin = 'AI';
          }
        }
      } else warnings.push(`AI relationship explanations unavailable (${res.error}).`);
    }
    return { related: expansion.related, graph: g };
  });

  const recommendations: StandardRecommendation[] = [...primary, ...related];

  // ---- Stage 6: Version & amendment intelligence ------------------------------
  const versionFindings = await stage('VERSIONS', async () => {
    const findings = [...recommendationFindings(recommendations, kb, now), ...citationFindings(spec.referencedStandards, kb, now)];
    for (const rec of recommendations) {
      const f = findings.find((x) => x.origin === 'RECOMMENDATION' && x.standardId === rec.standardId);
      if (f) rec.versionState = f.state;
    }
    const notable = findings.filter((f) => f.origin === 'INPUT_REFERENCE' && f.state !== 'CURRENT_VERIFIED');
    if (ai && notable.length) {
      const res = await ai.generate(versionReasoningPrompt, {
        findings: notable.map((f) => ({ findingId: f.id, citedAs: f.citedAs, state: f.state, facts: f.message })),
      });
      if (res.ok) {
        const byId = new Map(res.data.explanations.map((x) => [x.findingId, x.explanation]));
        for (const f of notable) {
          const explanation = byId.get(f.id);
          if (explanation) {
            f.explanation = truncate(explanation, 500);
            f.explanationOrigin = 'AI';
          }
        }
      } else warnings.push(`AI version reasoning unavailable (${res.error}).`);
    }
    return findings;
  });

  // ---- Stage 7: Certification intelligence ------------------------------------
  const certificationFindings = await stage('CERTIFICATION', async () => {
    const candidates = candidateRules(spec, recommendations, kb).filter((c) => c.rule.conditionTermsAny.length > 0);
    let aiAssessment = null;
    if (ai && candidates.length) {
      const res = await ai.generate(certificationClassificationPrompt, {
        requirementText: truncate(analysisText, 20_000),
        rules: candidates.map((c) => ({ ruleId: c.rule.id, title: c.rule.title, condition: c.rule.conditionDescription })),
      });
      if (res.ok) {
        const allowed = new Set(candidates.map((c) => c.rule.id));
        aiAssessment = { assessments: res.data.assessments.filter((a) => allowed.has(a.ruleId)) };
      } else warnings.push(`AI certification assessment unavailable (${res.error}); rule terms used.`);
    }
    return evaluateCertification(spec, recommendations, kb, analysisText, aiAssessment);
  });

  // ---- Stage 8: Specification gaps --------------------------------------------
  const { gaps, readiness } = await stage('GAPS', async () => {
    const preliminary = detectGaps({ spec, text: analysisText, category, recommendations, versionFindings, certificationFindings, ai: null });
    if (!ai || text.length < 40) return preliminary;
    const res = await ai.generate(gapAnalysisPrompt, {
      specificationText: truncate(text, 30_000),
      alreadyFound: preliminary.gaps.map((g) => g.issue).slice(0, 40),
    });
    if (!res.ok) {
      warnings.push(`AI gap analysis unavailable (${res.error}); rule-based gap detection used.`);
      return preliminary;
    }
    return detectGaps({ spec, text: analysisText, category, recommendations, versionFindings, certificationFindings, ai: res.data });
  });

  // ---- Report: evidence, abstention, summary ----------------------------------
  const { evidence, abstention, summary } = await stage('REPORT', async () => {
    const bundle = buildEvidence(kb, recommendations, versionFindings, certificationFindings, gaps);
    const reasons: string[] = [];
    if (!spec.productCategoryId) reasons.push('The product could not be matched to a category in the standards taxonomy.');
    if (spec.categoryConfidence === 'REVIEW_REQUIRED' && spec.productCategoryId) reasons.push('Signals about the product category conflict.');
    if (!primary.length) reasons.push('No indexed standard matched the requirement closely enough.');
    else if (primary.every((p) => p.reviewRequired)) reasons.push('Candidate standards did not meet the evidence threshold.');
    if (spec.language.normalization === 'UNAVAILABLE') reasons.push('The input language could not be normalised because AI services were unavailable.');
    const abstained = !primary.length || primary.every((p) => p.reviewRequired);
    const abst: Abstention = { abstained, message: abstained ? ABSTENTION_MESSAGE : null, reasons: abstained ? reasons : [] };
    const certFlags = certificationFindings.filter((f) => f.classification !== 'NOT_DETECTED').length;
    const sum: AnalysisSummary = {
      standardsIdentified: recommendations.filter((r) => !r.reviewRequired).length,
      primaryStandards: primary.filter((p) => !p.reviewRequired).length,
      highConfidence: recommendations.filter((r) => r.confidence === 'HIGH').length,
      reviewRequired: recommendations.filter((r) => r.reviewRequired).length,
      gaps: gaps.length,
      criticalGaps: gaps.filter((g) => g.severity === 'CRITICAL').length,
      certificationFlags: certFlags,
      readinessScore: readiness.score,
      abstained,
    };
    return { evidence: bundle.items, abstention: abst, summary: sum };
  });

  const trace: PipelineTrace = {
    pipelineVersion: PIPELINE_VERSION,
    aiMode: ai && ai.calls.some((c) => c.ok) ? 'AI_ASSISTED' : 'DETERMINISTIC_ONLY',
    model: ai?.model ?? null,
    promptVersions: ai?.promptVersions ?? {},
    aiCalls: ai?.calls ?? [],
    stageDurationsMs: durations,
    knowledgeBase: {
      standards: kb.standards.length,
      relationships: kb.relationships.length,
      certificationRules: kb.certificationRules.length,
      categories: kb.categories.length,
      loadedAt: kb.loadedAt,
    },
    candidateCount,
    warnings: [...new Set(warnings)],
  };

  const result: AnalysisResultDoc = {
    analysisId: input.analysisId,
    orgId: input.orgId,
    specification: spec,
    recommendations,
    versionFindings,
    certificationFindings,
    readiness,
    abstention,
    summary,
    trace,
    createdAt: now.toISOString(),
  };

  return { result, graph, gaps, evidence, status: abstention.abstained ? 'REVIEW_REQUIRED' : 'COMPLETED' };
}
