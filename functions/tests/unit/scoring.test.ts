import { describe, expect, it } from 'vitest';
import type { StandardRecord } from '../../../shared/knowledge';
import { detectCategory } from '../../src/engine/category';
import {
  PRIMARY_WEIGHTS,
  RELATED_WEIGHTS,
  factor,
  primaryConfidence,
  productMatchValue,
  relevanceLabel,
  totalScore,
  versionEvidenceValue,
  weakerConfidence,
} from '../../src/engine/scoring';
import { seedKnowledgeBase } from '../../src/seed';

const kb = seedKnowledgeBase();
const standard = (id: string) => kb.standards.find((s) => s.id === id)!;

describe('explainable scoring', () => {
  it('uses weights that sum to 1 so scores stay on a 0–100 scale', () => {
    const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(PRIMARY_WEIGHTS)).toBeCloseTo(1);
    expect(sum(RELATED_WEIGHTS)).toBeCloseTo(1);
  });

  it('computes the score as the sum of factor contributions', () => {
    const factors = [factor('semantic', 'Semantic', 1, 0.5, ''), factor('product', 'Product', 0.5, 0.5, '')];
    expect(totalScore(factors)).toBe(75);
    expect(factors[1]!.contribution).toBe(25);
  });

  it('maps scores to user-facing relevance labels', () => {
    expect(relevanceLabel(90)).toBe('HIGH_RELEVANCE');
    expect(relevanceLabel(60)).toBe('STRONG_MATCH');
    expect(relevanceLabel(40)).toBe('POSSIBLE_MATCH');
    expect(relevanceLabel(10)).toBe('NEEDS_REVIEW');
  });

  it('never gives full version evidence to unverified records', () => {
    expect(versionEvidenceValue(standard('is-17017-1')).value).toBe(0.6);
    const verified: StandardRecord = { ...standard('is-17017-1'), verification: { status: 'VERIFIED', verifiedAt: new Date().toISOString() } };
    expect(versionEvidenceValue(verified).value).toBe(1);
    expect(versionEvidenceValue(standard('is-8112')).value).toBe(0);
  });

  it('scores product match from metadata, including parent categories', () => {
    const acCharger = kb.categories.find((c) => c.id === 'ev-ac-charger')!;
    expect(productMatchValue(standard('is-17017-1'), acCharger).value).toBe(1);
    expect(productMatchValue(standard('is-269'), acCharger).value).toBe(0);
    const ppc = kb.categories.find((c) => c.id === 'ppc-cement')!;
    expect(productMatchValue(standard('is-269'), ppc).value).toBe(0.6);
  });
});

describe('confidence model', () => {
  const base = { score: 85, productValue: 1, categoryConfidence: 'HIGH' as const, hasSource: true, status: 'CURRENT' as const, ai: null };

  it('assigns HIGH only with strong score, full product match and an established category', () => {
    expect(primaryConfidence(base).level).toBe('HIGH');
    expect(primaryConfidence({ ...base, score: 60 }).level).toBe('MEDIUM');
    expect(primaryConfidence({ ...base, score: 40 }).level).toBe('LOW');
  });

  it('requires review below the evidence threshold, without sources, or on disagreement', () => {
    expect(primaryConfidence({ ...base, score: 20 }).level).toBe('REVIEW_REQUIRED');
    expect(primaryConfidence({ ...base, hasSource: false }).level).toBe('REVIEW_REQUIRED');
    expect(primaryConfidence({ ...base, status: 'WITHDRAWN' }).level).toBe('REVIEW_REQUIRED');
    expect(primaryConfidence({ ...base, categoryConfidence: 'REVIEW_REQUIRED' }).level).toBe('REVIEW_REQUIRED');
    const disagreement = primaryConfidence({ ...base, ai: { relevance: 0.1, role: 'NOT_RELEVANT', rationale: 'x', promptVersion: '1' } });
    expect(disagreement.level).toBe('REVIEW_REQUIRED');
    expect(disagreement.reviewReasons.join(' ')).toMatch(/disagrees/);
  });

  it('orders confidence levels', () => {
    expect(weakerConfidence('HIGH', 'LOW')).toBe('LOW');
    expect(weakerConfidence('REVIEW_REQUIRED', 'MEDIUM')).toBe('REVIEW_REQUIRED');
  });
});

describe('category detection', () => {
  it('prefers the product field and the most specific category', () => {
    const d = detectCategory('Supply of charger for parking', '22 kW AC EV charger', kb.categories, null);
    expect(d.categoryId).toBe('ev-ac-charger');
  });
  it('returns review-required when nothing matches', () => {
    const d = detectCategory('Ergonomic office chairs with mesh back', null, kb.categories, null);
    expect(d.categoryId).toBeNull();
    expect(d.confidence).toBe('REVIEW_REQUIRED');
  });
});
