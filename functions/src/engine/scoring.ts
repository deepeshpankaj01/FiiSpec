/**
 * Stages 3, 4 and 9 — relevance scoring, metadata filtering and final ranking.
 *
 * The score is an explainable weighted sum of named factors (0..1 each).
 * It is a ranking heuristic, NOT a calibrated probability, and is never
 * presented to users as accuracy.
 */
import type { AiRelevanceAssessment, ScoreFactor } from '../../../shared/analysis';
import type { ConfidenceLevel, RelevanceLabel, StandardStatus } from '../../../shared/constants';
import type { ProductCategory, StandardRecord } from '../../../shared/knowledge';
import { clamp01, containsPhrase, round } from './text';

export const PRIMARY_WEIGHTS = {
  semantic: 0.3,
  product: 0.3,
  scope: 0.15,
  industry: 0.1,
  relationship: 0.05,
  version: 0.1,
} as const;

export const RELATED_WEIGHTS = {
  relationship: 0.45,
  semantic: 0.2,
  scope: 0.1,
  industry: 0.1,
  version: 0.15,
  product: 0,
} as const;

/** BM25 score treated as a "full" lexical match. Chosen empirically on the benchmark corpus. */
export const BM25_REFERENCE = 9;

export const THRESHOLDS = {
  /** Minimum score for a candidate to be treated as a primary recommendation. */
  primaryMin: 45,
  /** Scores below this are always "review required". */
  reviewBelow: 35,
  highConfidence: 70,
  mediumConfidence: 55,
  maxPrimary: 3,
  /** Secondary primary standards must score within this many points of the best one. */
  primaryMargin: 8,
} as const;

export function versionEvidenceValue(standard: StandardRecord): { value: number; explanation: string } {
  const verified = standard.verification.status === 'VERIFIED';
  switch (standard.status as StandardStatus) {
    case 'CURRENT':
      return verified
        ? { value: 1, explanation: 'Listed as current; status verified by a reviewer against the official source.' }
        : { value: 0.6, explanation: 'Listed as current in the curated dataset; current status not yet verified against the official catalogue.' };
    case 'UNDER_REVISION':
      return { value: 0.5, explanation: 'Standard is recorded as under revision.' };
    case 'UNKNOWN':
      return { value: 0.3, explanation: 'Current status is not recorded in the dataset.' };
    default:
      return { value: 0, explanation: `Standard is recorded as ${standard.status.toLowerCase()}.` };
  }
}

export function productMatchValue(standard: StandardRecord, category: ProductCategory | null): { value: number; explanation: string } {
  if (!category) return { value: 0, explanation: 'Product category could not be determined.' };
  if (standard.productTypes.includes(category.id)) return { value: 1, explanation: `Standard metadata lists "${category.label}" as a covered product type.` };
  if (category.parentId && standard.productTypes.includes(category.parentId)) {
    return { value: 0.6, explanation: 'Standard covers the parent product family of this category.' };
  }
  return { value: 0, explanation: 'Product type is not listed in the standard metadata.' };
}

export function scopeMatch(standard: StandardRecord, textLower: string): { value: number; matched: string[] } {
  const matched = standard.keywords.filter((k) => containsPhrase(textLower, k));
  const denominator = Math.min(standard.keywords.length, 4) || 1;
  return { value: clamp01(matched.length / denominator), matched };
}

export function industryMatchValue(standard: StandardRecord, industry: string | null): number {
  if (!industry) return 0.5;
  if (standard.sector === industry) return 1;
  if (standard.sector === 'GENERAL' || industry === 'GENERAL') return 0.5;
  return 0;
}

export function semanticValue(bm25: number, ai: AiRelevanceAssessment | null): { value: number; explanation: string } {
  const lexical = clamp01(bm25 / BM25_REFERENCE);
  if (ai) {
    const value = clamp01(0.6 * ai.relevance + 0.4 * lexical);
    return { value, explanation: `AI relevance ${round(ai.relevance, 2)} combined with lexical match ${round(lexical, 2)}.` };
  }
  return { value: lexical, explanation: `Lexical (BM25) similarity between the requirement and the standard's title, scope and keywords: ${round(lexical, 2)}.` };
}

export function factor(key: ScoreFactor['key'], label: string, value: number, weight: number, explanation: string): ScoreFactor {
  const v = clamp01(value);
  return { key, label, value: round(v, 3), weight, contribution: round(v * weight * 100, 1), explanation };
}

export function totalScore(factors: ScoreFactor[]): number {
  return Math.round(factors.reduce((sum, f) => sum + f.value * f.weight * 100, 0));
}

export function relevanceLabel(score: number): RelevanceLabel {
  if (score >= THRESHOLDS.highConfidence) return 'HIGH_RELEVANCE';
  if (score >= THRESHOLDS.mediumConfidence) return 'STRONG_MATCH';
  if (score >= THRESHOLDS.reviewBelow) return 'POSSIBLE_MATCH';
  return 'NEEDS_REVIEW';
}

export interface PrimaryConfidenceInput {
  score: number;
  productValue: number;
  categoryConfidence: ConfidenceLevel;
  hasSource: boolean;
  status: StandardStatus;
  ai: AiRelevanceAssessment | null;
}

/** Confidence for a primary recommendation, with the reasons that forced review (if any). */
export function primaryConfidence(input: PrimaryConfidenceInput): { level: ConfidenceLevel; reviewReasons: string[] } {
  const reasons: string[] = [];
  if (input.score < THRESHOLDS.reviewBelow) reasons.push('Relevance score is below the evidence threshold.');
  if (!input.hasSource) reasons.push('No source reference is recorded for this standard.');
  if (input.status === 'SUPERSEDED' || input.status === 'WITHDRAWN') reasons.push(`Standard is recorded as ${input.status.toLowerCase()}.`);
  if (input.categoryConfidence === 'REVIEW_REQUIRED') reasons.push('The product category could not be established reliably.');
  if (input.ai && input.ai.role === 'NOT_RELEVANT' && input.productValue >= 0.6) {
    reasons.push('AI relevance assessment disagrees with the metadata match.');
  }
  if (reasons.length) return { level: 'REVIEW_REQUIRED', reviewReasons: reasons };

  const categoryStrong = input.categoryConfidence === 'HIGH' || input.categoryConfidence === 'MEDIUM';
  if (input.score >= THRESHOLDS.highConfidence && input.productValue >= 1 && categoryStrong) return { level: 'HIGH', reviewReasons: [] };
  if (input.score >= THRESHOLDS.mediumConfidence && input.productValue > 0) return { level: 'MEDIUM', reviewReasons: [] };
  return { level: 'LOW', reviewReasons: [] };
}

const CONFIDENCE_ORDER: ConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'REVIEW_REQUIRED'];

export function weakerConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return CONFIDENCE_ORDER[Math.max(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))]!;
}

export function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_ORDER.indexOf(level);
}
