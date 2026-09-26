import { describe, expect, it } from 'vitest';
import type { KnowledgeBase } from '../../../shared/knowledge';
import { parseCitations } from '../../src/engine/citations';
import { buildTimeline, citationFindings, isFreshlyVerified, matchCitation } from '../../src/engine/versions';
import { seedKnowledgeBase } from '../../src/seed';

const kb = seedKnowledgeBase();
const NOW = new Date('2026-09-25T00:00:00Z');
const findingFor = (text: string, base: KnowledgeBase = kb) => citationFindings(parseCitations(text), base, NOW)[0]!;

describe('version and amendment intelligence', () => {
  it('detects superseded references and names the successor', () => {
    const f = findingFor('Cement conforming to IS 8112:1989');
    expect(f.state).toBe('SUPERSEDED');
    expect(f.supersededBy).toBe('IS 269 : 2015');
  });

  it('detects withdrawn references', () => {
    expect(findingFor('Motor as per IS 325').state).toBe('WITHDRAWN');
  });

  it('detects an older edition of a current standard', () => {
    const f = findingFor('XLPE cable as per IS 7098 (Part 1):1988');
    expect(f.state).toBe('OUTDATED_EDITION');
    expect(f.currentDesignation).toBe('IS 7098 (Part 1) : 2025');
  });

  it('flags undated references', () => {
    expect(findingFor('bars conforming to IS 1786').state).toBe('UNDATED_REFERENCE');
  });

  it('does not claim anything about standards outside the dataset', () => {
    const f = findingFor('as per IS 99999');
    expect(f.state).toBe('NOT_INDEXED');
    expect(f.message).toMatch(/not in the indexed dataset/);
  });

  it('asks for the part when a multi-part series is cited without one', () => {
    const f = findingFor('charger to IS 17017');
    expect(f.state).toBe('NOT_INDEXED');
    expect(f.message).toMatch(/Specify the exact part/);
  });

  it('maps an IEC citation to the indexed Indian adoption', () => {
    const f = findingFor('shall comply with IEC 61851-23');
    expect(f.standardId).toBe('is-17017-23');
    expect(f.state).toBe('REQUIRES_VERIFICATION');
    expect(matchCitation(parseCitations('IEC 60529')[0]!, kb).adoption?.id).toBe('is-iec-60529');
  });

  it('reports "requires verification" for a matching edition that is not verified', () => {
    expect(findingFor('IS 269:2015').state).toBe('REQUIRES_VERIFICATION');
  });

  it('reports current (verified) only for a fresh verification', () => {
    const verified = { ...kb, standards: kb.standards.map((s) => (s.id === 'is-269' ? { ...s, verification: { status: 'VERIFIED' as const, verifiedAt: '2026-09-01T00:00:00Z' } } : s)) };
    expect(findingFor('IS 269:2015', verified).state).toBe('CURRENT_VERIFIED');
    const stale = { ...kb, standards: kb.standards.map((s) => (s.id === 'is-269' ? { ...s, verification: { status: 'VERIFIED' as const, verifiedAt: '2024-01-01T00:00:00Z' } } : s)) };
    expect(findingFor('IS 269:2015', stale).state).toBe('REQUIRES_VERIFICATION');
    expect(isFreshlyVerified(stale.standards.find((s) => s.id === 'is-269')!, NOW)).toBe(false);
  });

  it('builds a timeline with editions, amendments and the current entry', () => {
    const standards = new Map(kb.standards.map((s) => [s.id, s]));
    const timeline = buildTimeline(standards.get('is-8034')!, standards);
    expect(timeline.map((t) => t.kind)).toEqual(['ORIGINAL', 'REVISION', 'AMENDMENT', 'AMENDMENT', 'AMENDMENT', 'CURRENT']);
    const superseded = buildTimeline(standards.get('is-8112')!, standards);
    expect(superseded.at(-1)).toMatchObject({ kind: 'SUPERSEDED_BY', designation: 'IS 269 : 2015' });
  });
});
