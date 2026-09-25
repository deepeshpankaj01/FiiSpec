/**
 * Stage 2 — Candidate retrieval.
 * BM25 over curated standard metadata (title, scope, keywords) with query
 * expansion from the product taxonomy, unioned with metadata matches on
 * product type. Scales comfortably to a few thousand records in memory;
 * see docs/ai-pipeline.md for the vector-search upgrade path.
 */
import type { KnowledgeBase, ProductCategory, StandardRecord } from '../../../shared/knowledge';
import { tokenize } from './text';

const K1 = 1.4;
const B = 0.72;

export interface Bm25Index {
  docs: { id: string; tf: Map<string, number>; length: number }[];
  df: Map<string, number>;
  avgLength: number;
}

function documentText(standard: StandardRecord, categories: ProductCategory[]): string {
  const categoryTerms = standard.productTypes
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is ProductCategory => Boolean(c))
    .map((c) => `${c.label} ${c.aliases.join(' ')}`);
  // Title and keywords are repeated to weight them above free-text scope.
  return [standard.title, standard.title, standard.scope, standard.keywords.join(' '), standard.keywords.join(' '), ...categoryTerms].join(' ');
}

export function buildIndex(kb: KnowledgeBase): Bm25Index {
  const docs = kb.standards
    .filter((s) => s.lifecycle === 'PUBLISHED')
    .map((s) => {
      const tokens = tokenize(documentText(s, kb.categories));
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      return { id: s.id, tf, length: tokens.length };
    });
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of doc.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, docs.length);
  return { docs, df, avgLength };
}

export function bm25Search(index: Bm25Index, query: string, limit = 25): { id: string; score: number; matchedTerms: string[] }[] {
  const terms = [...new Set(tokenize(query))];
  const n = index.docs.length;
  const results: { id: string; score: number; matchedTerms: string[] }[] = [];
  for (const doc of index.docs) {
    let score = 0;
    const matched: string[] = [];
    for (const term of terms) {
      const f = doc.tf.get(term);
      if (!f) continue;
      const df = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / index.avgLength)));
      matched.push(term);
    }
    if (score > 0) results.push({ id: doc.id, score, matchedTerms: matched });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface Candidate {
  standard: StandardRecord;
  bm25: number;
  matchedTerms: string[];
  viaMetadata: boolean;
}

export function buildQuery(parts: { text: string; productName: string; category: ProductCategory | null; intendedUse: string | null }): string {
  const expansion = parts.category ? `${parts.category.label} ${parts.category.aliases.join(' ')}` : '';
  return [parts.productName, parts.productName, parts.intendedUse ?? '', expansion, parts.text].join(' ');
}

export function retrieveCandidates(
  kb: KnowledgeBase,
  index: Bm25Index,
  query: string,
  category: ProductCategory | null,
): Candidate[] {
  const hits = bm25Search(index, query, 25);
  const byId = new Map(kb.standards.map((s) => [s.id, s]));
  const candidates = new Map<string, Candidate>();
  for (const hit of hits) {
    const standard = byId.get(hit.id);
    if (standard) candidates.set(hit.id, { standard, bm25: hit.score, matchedTerms: hit.matchedTerms, viaMetadata: false });
  }
  if (category) {
    const relatedCategoryIds = new Set([category.id, ...(category.parentId ? [category.parentId] : [])]);
    for (const standard of kb.standards) {
      if (standard.lifecycle !== 'PUBLISHED') continue;
      if (!standard.productTypes.some((t) => relatedCategoryIds.has(t))) continue;
      const existing = candidates.get(standard.id);
      if (existing) existing.viaMetadata = true;
      else candidates.set(standard.id, { standard, bm25: 0, matchedTerms: [], viaMetadata: true });
    }
  }
  return [...candidates.values()];
}
