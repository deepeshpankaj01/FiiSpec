import { onCall } from 'firebase-functions/https';
import { SearchStandardsSchema } from '../../../shared/api';
import type { KnowledgeBase, StandardRecord } from '../../../shared/knowledge';
import { designationOf } from '../engine/recommend';
import { bm25Search, buildIndex, type Bm25Index } from '../engine/retrieval';
import { callerFrom } from '../lib/auth';
import { ENFORCE_APP_CHECK, FUNCTIONS_REGION } from '../lib/config';
import { parseRequest } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';
import { loadKnowledgeBase } from './repository';

export interface StandardSearchHit {
  id: string;
  standardNumber: string;
  designation: string;
  title: string;
  sector: string;
  kind: string;
  status: string;
  verificationStatus: string;
  dataOrigin: string;
  matchedOn: 'NUMBER' | 'TEXT';
}

let indexCache: { kb: KnowledgeBase; index: Bm25Index } | null = null;

function toHit(s: StandardRecord, matchedOn: StandardSearchHit['matchedOn']): StandardSearchHit {
  return {
    id: s.id,
    standardNumber: s.standardNumber,
    designation: designationOf(s),
    title: s.title,
    sector: s.sector,
    kind: s.kind,
    status: s.status,
    verificationStatus: s.verification.status,
    dataOrigin: s.dataOrigin,
    matchedOn,
  };
}

/** Pure search used by the callable and by tests. Standard numbers match exactly first, then BM25 over metadata. */
export function searchKnowledgeBase(kb: KnowledgeBase, index: Bm25Index, query: string, sector: string | undefined, limit: number): StandardSearchHit[] {
  const published = kb.standards.filter((s) => s.lifecycle === 'PUBLISHED' && (!sector || s.sector === sector));
  const trimmed = query.trim();
  if (!trimmed) return published.sort((a, b) => Number(a.baseNumber) - Number(b.baseNumber)).slice(0, limit).map((s) => toHit(s, 'TEXT'));
  const numbers: string[] = trimmed.match(/\d{2,6}/g) ?? [];
  const byNumber = published.filter((s) => numbers.includes(s.baseNumber));
  const seen = new Set(byNumber.map((s) => s.id));
  const allowed = new Set(published.map((s) => s.id));
  const byText = bm25Search(index, trimmed, 100)
    .filter((h) => allowed.has(h.id) && !seen.has(h.id))
    .map((h) => kb.standards.find((s) => s.id === h.id)!)
    .filter(Boolean);
  return [...byNumber.map((s) => toHit(s, 'NUMBER')), ...byText.map((s) => toHit(s, 'TEXT'))].slice(0, limit);
}

export const searchStandards = onCall({ region: FUNCTIONS_REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = callerFrom(request);
  const req = parseRequest(SearchStandardsSchema, request.data);
  await enforceRateLimit(caller.uid, 'searchStandards');
  const kb = await loadKnowledgeBase();
  if (!indexCache || indexCache.kb !== kb) indexCache = { kb, index: buildIndex(kb) };
  return { hits: searchKnowledgeBase(kb, indexCache.index, req.query, req.sector, req.limit), total: kb.standards.filter((s) => s.lifecycle === 'PUBLISHED').length };
});
