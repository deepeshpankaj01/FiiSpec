/**
 * Primary ranking (Stages 3/4/9) and relationship expansion (Stage 5).
 */
import type { AiRelevanceAssessment, StandardRecommendation, StructuredSpecification } from '../../../shared/analysis';
import type { ConfidenceLevel, CuratedRelationshipType, ProvenanceClass } from '../../../shared/constants';
import { RELATIONSHIP_LABELS, RELATIONSHIP_PROVENANCE_LABELS } from '../../../shared/constants';
import type { KnowledgeBase, ProductCategory, RelationshipRecord, StandardRecord } from '../../../shared/knowledge';
import type { Candidate } from './retrieval';
import {
  PRIMARY_WEIGHTS,
  RELATED_WEIGHTS,
  THRESHOLDS,
  factor,
  industryMatchValue,
  primaryConfidence,
  productMatchValue,
  relevanceLabel,
  scopeMatch,
  semanticValue,
  totalScore,
  versionEvidenceValue,
} from './scoring';
import { clamp01 } from './text';

export function designationOf(s: StandardRecord): string {
  return s.publicationYear ? `${s.standardNumber} : ${s.publicationYear}` : s.standardNumber;
}

/** A record counts as verified official information only after an administrator verified it against the official source. */
export function isVerifiedOfficial(record: { dataOrigin: string; verification: { status: string } }): boolean {
  return record.verification.status === 'VERIFIED' && record.dataOrigin !== 'DEMO_PLACEHOLDER';
}

function provenanceClassFor(standard: StandardRecord, reviewRequired: boolean): ProvenanceClass {
  if (reviewRequired) return 'HUMAN_REVIEW_REQUIRED';
  return isVerifiedOfficial(standard) ? 'VERIFIED_OFFICIAL' : 'CURATED_BENCHMARK';
}

function nextActionFor(rec: Pick<StandardRecommendation, 'confidence' | 'verificationStatus' | 'tier'>): string {
  if (rec.confidence === 'REVIEW_REQUIRED') return 'Send for technical review before citing in the tender.';
  if (rec.verificationStatus !== 'VERIFIED') return 'Include in the specification after confirming the current edition and amendments on the BIS portal.';
  return rec.tier === 'PRIMARY' ? 'Cite as the governing product standard.' : 'Cite as a supporting requirement where in scope.';
}

export interface PrimaryRankingResult {
  primary: StandardRecommendation[];
  /** Candidates that were considered but did not qualify (kept for the trace and review). */
  considered: number;
  bestScore: number;
}

export function rankPrimary(
  candidates: Candidate[],
  spec: StructuredSpecification,
  category: ProductCategory | null,
  textLower: string,
  aiAssessments: Map<string, AiRelevanceAssessment>,
  relationshipCounts: Map<string, number>,
): PrimaryRankingResult {
  const scored = candidates
    .filter((c) => c.standard.status !== 'SUPERSEDED' && c.standard.status !== 'WITHDRAWN')
    .map((c) => {
      const s = c.standard;
      const ai = aiAssessments.get(s.id) ?? null;
      const semantic = semanticValue(c.bm25, ai);
      const product = productMatchValue(s, category);
      const scope = scopeMatch(s, textLower);
      const industry = industryMatchValue(s, spec.industry);
      const version = versionEvidenceValue(s);
      const relationshipCount = relationshipCounts.get(s.id) ?? 0;
      const factors = [
        factor('semantic', 'Semantic relevance', semantic.value, PRIMARY_WEIGHTS.semantic, semantic.explanation),
        factor('product', 'Product match', product.value, PRIMARY_WEIGHTS.product, product.explanation),
        factor(
          'scope',
          'Scope match',
          scope.value,
          PRIMARY_WEIGHTS.scope,
          scope.matched.length ? `Scope keywords found in the requirement: ${scope.matched.join(', ')}.` : 'No scope keywords found in the requirement.',
        ),
        factor('industry', 'Industry match', industry, PRIMARY_WEIGHTS.industry, industry === 1 ? 'Same sector as the requirement.' : industry > 0 ? 'Sector not determined or general-purpose standard.' : 'Different sector from the requirement.'),
        factor(
          'relationship',
          'Relationship evidence',
          clamp01(relationshipCount / 4),
          PRIMARY_WEIGHTS.relationship,
          relationshipCount
            ? `${relationshipCount} provenance-backed relationship(s) connect this standard to supporting references.`
            : 'No curated relationships recorded for this standard.',
        ),
        factor('version', 'Version evidence', version.value, PRIMARY_WEIGHTS.version, version.explanation),
      ];
      return { candidate: c, ai, product, scope, factors };
    });

  const results: StandardRecommendation[] = scored.map(({ candidate, ai, product, scope, factors }) => {
    const s = candidate.standard;
    const score = totalScore(factors);
    const { level, reviewReasons } = primaryConfidence({
      score,
      productValue: product.value,
      categoryConfidence: spec.categoryConfidence,
      hasSource: Boolean(s.source.url || s.source.name),
      status: s.status,
      ai,
    });
    const reasons: string[] = [];
    if (product.value >= 1 && category) reasons.push(`The standard's recorded product types include ${category.label}.`);
    if (scope.matched.length) reasons.push(`Its scope aligns with requirement terms: ${scope.matched.slice(0, 5).join(', ')}.`);
    if (ai && ai.role !== 'NOT_RELEVANT') reasons.push(`AI assessment: ${ai.rationale}`);
    if (!reasons.length) reasons.push('Retrieved by lexical similarity to the requirement text.');
    const verificationStatus = s.verification.status;
    const rec: StandardRecommendation = {
      id: `rec-${s.id}`,
      standardId: s.id,
      standardNumber: s.standardNumber,
      designation: designationOf(s),
      title: s.title,
      kind: s.kind,
      sector: s.sector,
      tier: 'PRIMARY',
      relationship: null,
      score,
      relevanceLabel: relevanceLabel(score),
      confidence: level,
      factors,
      reasons,
      matchedTerms: [...new Set([...scope.matched, ...candidate.matchedTerms])].slice(0, 12),
      status: s.status,
      versionState: 'REQUIRES_VERIFICATION',
      verificationStatus,
      provenanceClass: provenanceClassFor(s, level === 'REVIEW_REQUIRED'),
      evidenceIds: [],
      aiAssessment: ai,
      nextAction: '',
      reviewRequired: level === 'REVIEW_REQUIRED',
      reviewReasons,
      sourceUrl: s.source.url ?? null,
      sourceName: s.source.name,
    };
    rec.nextAction = nextActionFor(rec);
    return rec;
  });

  results.sort((a, b) => b.score - a.score);
  const bestScore = results[0]?.score ?? 0;

  const eligible = results.filter((r) => r.score >= THRESHOLDS.primaryMin && r.factors.find((f) => f.key === 'product')!.value > 0);
  // Additional primaries must be close to the best match; weaker alternatives surface through relationships instead.
  const topEligible = eligible[0]?.score ?? 0;
  let primary = eligible.filter((r) => r.score >= topEligible - THRESHOLDS.primaryMargin).slice(0, THRESHOLDS.maxPrimary);

  if (!primary.length) {
    // Nothing qualifies: surface the best candidates as unconfirmed, always marked for review.
    primary = results
      .filter((r) => r.score >= 25)
      .slice(0, 2)
      .map((r) => ({
        ...r,
        confidence: 'REVIEW_REQUIRED' as ConfidenceLevel,
        reviewRequired: true,
        provenanceClass: 'HUMAN_REVIEW_REQUIRED' as ProvenanceClass,
        reviewReasons: [...new Set([...r.reviewReasons, 'Candidate did not meet the evidence threshold for a primary recommendation.'])],
        nextAction: 'Send for technical review before citing in the tender.',
      }));
  }
  return { primary, considered: results.length, bestScore };
}

// ---------------------------------------------------------------------------
// Relationship expansion
// ---------------------------------------------------------------------------

const TYPE_WEIGHT: Record<CuratedRelationshipType, number> = {
  NORMATIVE_REFERENCE: 0.95,
  TEST_METHOD: 0.9,
  SAFETY: 0.9,
  INSTALLATION: 0.85,
  RELATED_PRODUCT: 0.8,
  TERMINOLOGY: 0.7,
  RELATED_STANDARD: 0.7,
};

/** Edge types followed at depth 2. */
const DEPTH2_TYPES = new Set<CuratedRelationshipType>(['NORMATIVE_REFERENCE', 'TEST_METHOD', 'SAFETY']);
/**
 * Only standards reached through structural edges are expanded further.
 * Contextual edges (installation, related standard, terminology) are leaves:
 * following them would drift into other products (e.g. cement → IS 456 → rebar).
 */
const EXPANDABLE_VIA = new Set<CuratedRelationshipType>(['NORMATIVE_REFERENCE', 'RELATED_PRODUCT', 'SAFETY']);
/** Related standards scoring below this are not surfaced as recommendations. */
export const MIN_RELATED_SCORE = 30;
const MAX_RELATED = 30;

export interface ExpansionEdge {
  relationship: RelationshipRecord;
  depth: number;
}

export interface ExpansionResult {
  related: StandardRecommendation[];
  edges: ExpansionEdge[];
}

export function expandRelationships(
  primary: StandardRecommendation[],
  kb: KnowledgeBase,
  spec: StructuredSpecification,
  category: ProductCategory | null,
  textLower: string,
  bm25ById: Map<string, number>,
): ExpansionResult {
  const standards = new Map(kb.standards.map((s) => [s.id, s]));
  const edgesFrom = new Map<string, RelationshipRecord[]>();
  for (const r of kb.relationships) {
    if (r.lifecycle !== 'PUBLISHED') continue;
    const list = edgesFrom.get(r.fromId) ?? [];
    list.push(r);
    edgesFrom.set(r.fromId, list);
  }

  const primaryIds = new Set(primary.map((p) => p.standardId));
  const related = new Map<string, StandardRecommendation>();
  const edges: ExpansionEdge[] = [];
  const installationInScope =
    Boolean(spec.installationContext) || spec.environment.setting !== 'UNSPECIFIED' || Boolean(category?.requiresInstallation);

  type QueueItem = { fromId: string; depth: number; parentScore: number; parentConfidence: ConfidenceLevel; parentDesignation: string };
  const queue: QueueItem[] = primary
    .filter((p) => !p.reviewRequired || primary.every((q) => q.reviewRequired))
    .map((p) => ({ fromId: p.standardId, depth: 1, parentScore: p.score, parentConfidence: p.confidence, parentDesignation: p.designation }));

  while (queue.length) {
    const item = queue.shift()!;
    for (const rel of edgesFrom.get(item.fromId) ?? []) {
      if (item.depth > 1 && !DEPTH2_TYPES.has(rel.type)) continue;
      const target = standards.get(rel.toId);
      if (!target || target.lifecycle !== 'PUBLISHED') continue;
      edges.push({ relationship: rel, depth: item.depth });
      if (primaryIds.has(target.id) || related.has(target.id)) continue;
      if (related.size >= MAX_RELATED) continue;

      const provenanceStrength = rel.provenance.type === 'CURATED_EXPERT' ? 0.85 : 1;
      const depthDecay = item.depth === 1 ? 1 : 0.85;
      const installationFactor = rel.type === 'INSTALLATION' && !installationInScope ? 0.8 : 1;
      const relValue = clamp01((item.parentScore / 100) * TYPE_WEIGHT[rel.type] * depthDecay * provenanceStrength * installationFactor * 1.15);
      const semantic = semanticValue(bm25ById.get(target.id) ?? 0, null);
      const scope = scopeMatch(target, textLower);
      const industry = industryMatchValue(target, spec.industry);
      const version = versionEvidenceValue(target);
      const factors = [
        factor(
          'relationship',
          'Relationship evidence',
          relValue,
          RELATED_WEIGHTS.relationship,
          `${RELATIONSHIP_LABELS[rel.type]} of ${item.parentDesignation} (${RELATIONSHIP_PROVENANCE_LABELS[rel.provenance.type].toLowerCase()}).`,
        ),
        factor('semantic', 'Semantic relevance', semantic.value, RELATED_WEIGHTS.semantic, semantic.explanation),
        factor('scope', 'Scope match', scope.value, RELATED_WEIGHTS.scope, scope.matched.length ? `Keywords found: ${scope.matched.join(', ')}.` : 'No direct keyword overlap; included through the relationship.'),
        factor('industry', 'Industry match', industry, RELATED_WEIGHTS.industry, industry === 1 ? 'Same sector.' : 'Cross-sector or general standard.'),
        factor('version', 'Version evidence', version.value, RELATED_WEIGHTS.version, version.explanation),
      ];
      const score = totalScore(factors);
      if (score < MIN_RELATED_SCORE && item.parentConfidence !== 'REVIEW_REQUIRED') continue;

      let confidence: ConfidenceLevel;
      const reviewReasons: string[] = [];
      if (item.parentConfidence === 'REVIEW_REQUIRED') reviewReasons.push('The parent recommendation requires review.');
      if (rel.verification.status === 'DISPUTED') reviewReasons.push('This relationship has been disputed by a reviewer.');
      if (target.status === 'SUPERSEDED' || target.status === 'WITHDRAWN') reviewReasons.push(`Standard is recorded as ${target.status.toLowerCase()}.`);
      if (reviewReasons.length) confidence = 'REVIEW_REQUIRED';
      else if (item.parentConfidence === 'HIGH' && rel.provenance.type !== 'CURATED_EXPERT') confidence = 'HIGH';
      else if (item.parentConfidence === 'HIGH' || item.parentConfidence === 'MEDIUM') confidence = 'MEDIUM';
      else confidence = 'LOW';

      const reasons = [rel.provenance.statement];
      if (rel.contextNote) reasons.push(rel.contextNote);
      if (rel.type === 'INSTALLATION' && !installationInScope) reasons.push('Relevant if installation is within the scope of supply.');

      const rec: StandardRecommendation = {
        id: `rec-${target.id}`,
        standardId: target.id,
        standardNumber: target.standardNumber,
        designation: designationOf(target),
        title: target.title,
        kind: target.kind,
        sector: target.sector,
        tier: 'RELATED',
        relationship: {
          type: rel.type,
          fromStandardId: item.fromId,
          fromDesignation: item.parentDesignation,
          relationshipId: rel.id,
          provenanceType: rel.provenance.type,
          statement: rel.provenance.statement,
          contextNote: rel.contextNote ?? null,
        },
        score,
        relevanceLabel: relevanceLabel(score),
        confidence,
        factors,
        reasons,
        matchedTerms: scope.matched,
        status: target.status,
        versionState: 'REQUIRES_VERIFICATION',
        verificationStatus: target.verification.status,
        provenanceClass: provenanceClassFor(target, confidence === 'REVIEW_REQUIRED'),
        evidenceIds: [],
        aiAssessment: null,
        nextAction: '',
        reviewRequired: confidence === 'REVIEW_REQUIRED',
        reviewReasons,
        sourceUrl: target.source.url ?? null,
        sourceName: target.source.name,
      };
      rec.nextAction = nextActionFor(rec);
      related.set(target.id, rec);

      if (item.depth < 2 && EXPANDABLE_VIA.has(rel.type)) {
        queue.push({ fromId: target.id, depth: item.depth + 1, parentScore: score, parentConfidence: confidence, parentDesignation: rec.designation });
      }
    }
  }

  return { related: [...related.values()].sort((a, b) => b.score - a.score), edges };
}

/** Number of published, provenance-backed outgoing relationships per standard. */
export function relationshipCounts(kb: KnowledgeBase): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of kb.relationships) {
    if (r.lifecycle !== 'PUBLISHED') continue;
    counts.set(r.fromId, (counts.get(r.fromId) ?? 0) + 1);
  }
  return counts;
}
