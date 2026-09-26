/**
 * Product-category recognition against the curated taxonomy.
 * Aliases are technical names and trade synonyms (e.g. "EVSE", "wallbox"),
 * not translations.
 */
import type { ConfidenceLevel } from '../../../shared/constants';
import type { ProductCategory } from '../../../shared/knowledge';
import { containsPhrase, normalizeText } from './text';

export interface CategoryDetection {
  categoryId: string | null;
  confidence: ConfidenceLevel;
  alternatives: { id: string; label: string; score: number }[];
  evidence: string[];
}

interface Scored {
  category: ProductCategory;
  score: number;
  hits: string[];
}

export function detectCategory(
  text: string,
  productField: string | null,
  categories: ProductCategory[],
  sectorHint: string | null,
): CategoryDetection {
  const body = normalizeText(text).toLowerCase();
  const product = normalizeText(productField ?? '').toLowerCase();
  const lead = body.slice(0, 240);

  const scored: Scored[] = [];
  for (const category of categories) {
    if (category.lifecycle !== 'PUBLISHED') continue;
    let score = 0;
    const hits: string[] = [];
    for (const alias of [category.label, ...category.aliases]) {
      const words = alias.trim().split(/\s+/).length;
      const specificity = 1 + (words - 1) * 0.75;
      let hit = false;
      if (product && containsPhrase(product, alias)) {
        score += 3 * specificity;
        hit = true;
      }
      if (containsPhrase(lead, alias)) {
        score += 1.5 * specificity;
        hit = true;
      } else if (containsPhrase(body, alias)) {
        score += 1 * specificity;
        hit = true;
      }
      if (hit) hits.push(alias);
    }
    if (score > 0 && sectorHint && category.sector === sectorHint) score *= 1.25;
    if (score > 0) scored.push({ category, score, hits });
  }

  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) {
    return { categoryId: null, confidence: 'REVIEW_REQUIRED', alternatives: [], evidence: ['No product category in the taxonomy matched the text.'] };
  }

  // Prefer the most specific category when a child and its parent both match.
  let best = scored[0]!;
  const child = scored.find((s) => s.category.parentId === best.category.id && s.score >= best.score * 0.6);
  if (child) best = child;

  const runnerUp = scored.find((s) => s !== best && s.category.id !== best.category.parentId && s.category.parentId !== best.category.id);
  const margin = runnerUp ? best.score / runnerUp.score : Infinity;
  const strongSignal = best.score >= 3;

  let confidence: ConfidenceLevel;
  if (strongSignal && margin >= 2) confidence = 'HIGH';
  else if (best.score >= 1.5 && margin >= 1.3) confidence = 'MEDIUM';
  else if (best.score >= 1) confidence = 'LOW';
  else confidence = 'REVIEW_REQUIRED';

  return {
    categoryId: best.category.id,
    confidence,
    alternatives: scored
      .filter((s) => s !== best)
      .slice(0, 3)
      .map((s) => ({ id: s.category.id, label: s.category.label, score: Math.round(s.score * 10) / 10 })),
    evidence: best.hits.map((h) => `Matched product term "${h}"`),
  };
}
