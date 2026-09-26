import { describe, expect, it } from 'vitest';
import { CreateAnalysisSchema, JoinOrganizationSchema, UploadDescriptorSchema } from '../../../shared/api';
import { originFor, validateIngestionPayload } from '../../src/admin';
import { composeInputText, deriveTitle, initialStages } from '../../src/analysis/create';
import { isInFlight } from '../../src/analysis/retry';
import { detectFormat, tablesFromHtml } from '../../src/documents/extract';
import { evaluateCase, summarize } from '../../src/engine/benchmark';
import { PERMISSIONS, can } from '../../src/lib/auth';
import { parseRequest, stripNulls } from '../../src/lib/errors';
import { nextWindowState } from '../../src/lib/rateLimit';
import { generateJoinCode } from '../../src/orgs';
import { validatedSeed, seedKnowledgeBase } from '../../src/seed';
import { searchKnowledgeBase } from '../../src/standards/search';
import { buildIndex } from '../../src/engine/retrieval';
import { recomputeReadiness } from '../../src/workflow/gaps';

describe('role permissions', () => {
  it('restricts knowledge-base management to administrators', () => {
    expect(can('ADMIN', 'manageKnowledgeBase')).toBe(true);
    for (const role of ['PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'] as const) expect(can(role, 'manageKnowledgeBase')).toBe(false);
  });
  it('lets organisation users analyse and export but not approve or edit specifications', () => {
    expect(can('ORGANIZATION_USER', 'createAnalysis')).toBe(true);
    expect(can('ORGANIZATION_USER', 'exportReport')).toBe(true);
    expect(can('ORGANIZATION_USER', 'approveSpecification')).toBe(false);
    expect(can('ORGANIZATION_USER', 'editSpecification')).toBe(false);
    expect(can('REVIEWER', 'approveSpecification')).toBe(true);
    expect(can('REVIEWER', 'manageMembers')).toBe(false);
    expect(can(null, 'createAnalysis')).toBe(false);
  });
  it('defines every permission for at least the admin role', () => {
    for (const roles of Object.values(PERMISSIONS)) expect(roles).toContain('ADMIN');
  });
});

describe('rate limiting', () => {
  it('allows requests up to the limit within a window, then blocks, then resets', () => {
    let state: { windowStart: number; count: number } | undefined;
    for (let i = 0; i < 3; i += 1) {
      const r = nextWindowState(state, 1000, 3, 60);
      expect(r.allowed).toBe(true);
      state = r.state;
    }
    expect(nextWindowState(state, 2000, 3, 60).allowed).toBe(false);
    expect(nextWindowState(state, 1000 + 61_000, 3, 60)).toEqual({ allowed: true, state: { windowStart: 62_000, count: 1 } });
  });
});

describe('callable payload normalisation', () => {
  it('treats null fields (how the callable protocol sends undefined) as absent', () => {
    expect(stripNulls({ mode: 'DESCRIPTION', form: { product: null, description: 'x', nested: [{ a: null, b: 1 }] } })).toEqual({ mode: 'DESCRIPTION', form: { description: 'x', nested: [{ b: 1 }] } });
    expect(parseRequest(CreateAnalysisSchema, { mode: 'DESCRIPTION', form: { product: null, purpose: null, description: '11 kW outdoor AC EV charger' }, file: null }).form.product).toBeUndefined();
  });
});

describe('input validation', () => {
  it('requires a file for document mode and text for other modes', () => {
    expect(CreateAnalysisSchema.safeParse({ mode: 'DOCUMENT', form: {} }).success).toBe(false);
    expect(CreateAnalysisSchema.safeParse({ mode: 'DESCRIPTION', form: { description: 'EV' } }).success).toBe(false);
    expect(CreateAnalysisSchema.safeParse({ mode: 'DESCRIPTION', form: { description: '11 kW outdoor EV charger' } }).success).toBe(true);
  });
  it('rejects unsupported, oversized or unsafe uploads', () => {
    expect(UploadDescriptorSchema.safeParse({ name: 'tender.exe', size: 10, contentType: 'application/x-msdownload' }).success).toBe(false);
    expect(UploadDescriptorSchema.safeParse({ name: 'tender.pdf', size: 20 * 1024 * 1024, contentType: 'application/pdf' }).success).toBe(false);
    expect(UploadDescriptorSchema.safeParse({ name: '../../etc/passwd', size: 10, contentType: 'application/pdf' }).success).toBe(false);
    expect(UploadDescriptorSchema.safeParse({ name: 'tender.pdf', size: 1024, contentType: 'application/pdf' }).success).toBe(true);
  });
  it('validates join code format', () => {
    expect(JoinOrganizationSchema.safeParse({ joinCode: 'abcd-1234' }).success).toBe(true);
    expect(JoinOrganizationSchema.safeParse({ joinCode: 'abcd1234' }).success).toBe(false);
    expect(generateJoinCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it('detects file formats by magic bytes, not by declared type', () => {
    expect(detectFormat(Buffer.from('%PDF-1.7\n...'))).toBe('PDF');
    expect(detectFormat(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml')]))).toBe('DOCX');
    expect(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBeNull(); // plain zip
    expect(detectFormat(Buffer.from('MZ executable'))).toBeNull();
  });
  it('treats a run with no progress for 10 minutes as stale, so it can be retried', () => {
    const now = Date.parse('2026-09-25T12:00:00.000Z');
    expect(isInFlight({ status: 'PROCESSING', updatedAt: '2026-09-25T11:55:00.000Z' }, now)).toBe(true);
    expect(isInFlight({ status: 'QUEUED', updatedAt: '2026-09-25T11:49:00.000Z' }, now)).toBe(false);
    expect(isInFlight({ status: 'FAILED', updatedAt: '2026-09-25T11:59:00.000Z' }, now)).toBe(false);
  });
  it('extracts DOCX tables into rows', () => {
    expect(tablesFromHtml('<table><tr><td>Rated power</td><td>11 kW</td></tr><tr><td>IP rating</td><td>IP55</td></tr></table>')).toEqual([[['Rated power', '11 kW'], ['IP rating', 'IP55']]]);
  });
  it('composes pipeline text from the structured form', () => {
    const text = composeInputText({ mode: 'SPECIFICATION', form: { product: 'EV charger', technicalSpecification: '11 kW', procurementContext: 'Municipal corporation' } });
    expect(text).toBe('Product: EV charger\n11 kW\nProcurement context: Municipal corporation');
    expect(deriveTitle({ mode: 'DESCRIPTION', form: { description: '11 kW outdoor AC EV charger for public charging. More text.' } })).toBe('11 kW outdoor AC EV charger for public charging.');
    expect(initialStages('DESCRIPTION').UPLOADING?.state).toBe('SKIPPED');
    expect(initialStages('DOCUMENT').UPLOADING?.state).toBe('PENDING');
  });
});

describe('controlled ingestion', () => {
  it('validates each record and reports errors by index', () => {
    const seed = validatedSeed();
    const payload = JSON.stringify([seed.standards[0], { id: 'Bad Id', title: 'x' }]);
    const r = validateIngestionPayload('standards', payload);
    expect(r.valid).toHaveLength(1);
    expect(r.errors[0]!.index).toBe(1);
    expect(validateIngestionPayload('standards', 'not json').errors[0]!.message).toMatch(/JSON/);
  });
  it('treats only government sources as official', () => {
    expect(originFor({ name: 'BIS', sourceType: 'BIS_CATALOGUE' })).toBe('OFFICIAL_SOURCE');
    expect(originFor({ name: 'Blog', sourceType: 'SECONDARY' })).toBe('CURATED_PUBLIC_REFERENCE');
  });
});

describe('seed dataset honesty invariants', () => {
  const seed = validatedSeed();
  it('passes referential integrity checks', () => {
    expect(seed.standards.length).toBeGreaterThan(40);
  });
  it('marks no record as verified and none as an official-source record', () => {
    for (const r of [...seed.standards, ...seed.relationships, ...seed.certificationRules]) {
      expect(r.verification.status).toBe('UNVERIFIED');
    }
    expect(seed.standards.every((s) => s.dataOrigin === 'CURATED_PUBLIC_REFERENCE')).toBe(true);
  });
  it('gives every relationship a provenance statement, and every official one a source URL', () => {
    for (const r of seed.relationships) {
      expect(r.provenance.statement.length).toBeGreaterThan(20);
      if (r.provenance.type === 'OFFICIAL_CATALOGUE') expect(r.provenance.source?.url).toMatch(/^https:\/\//);
    }
  });
  it('gives every standard and rule a source', () => {
    for (const s of seed.standards) expect(s.source.url).toMatch(/^https:\/\//);
    for (const r of seed.certificationRules) expect(r.source.name.length).toBeGreaterThan(3);
  });
});

describe('standards search', () => {
  const kb = seedKnowledgeBase();
  const index = buildIndex(kb);
  it('matches standard numbers exactly first', () => {
    const hits = searchKnowledgeBase(kb, index, 'IS 17017', undefined, 5);
    expect(hits.every((h) => h.standardNumber.startsWith('IS 17017'))).toBe(true);
  });
  it('searches titles and keywords', () => {
    expect(searchKnowledgeBase(kb, index, 'earthing', undefined, 3)[0]!.id).toBe('is-3043');
  });
  it('filters by sector', () => {
    expect(searchKnowledgeBase(kb, index, '', 'CIVIL_CONSTRUCTION', 50).every((h) => h.sector === 'CIVIL_CONSTRUCTION')).toBe(true);
  });
});

describe('readiness recomputation after review', () => {
  it('counts resolved missing parameters as covered and removes dismissed ones', () => {
    const g = (status: 'OPEN' | 'RESOLVED' | 'DISMISSED') => ({ id: status, code: 'c', category: 'MISSING_PARAMETER' as const, severity: 'CRITICAL' as const, issue: '', whyItMatters: '', suggestion: '', quote: null, evidence: null, relatedStandardIds: [], origin: 'RULE' as const, status, statusNote: null, updatedBy: null });
    const r = recomputeReadiness([g('RESOLVED'), g('DISMISSED'), g('OPEN')], { covered: 7, total: 10 });
    expect(r.parameterCoverage).toEqual({ covered: 8, total: 9 });
  });
});

describe('benchmark evaluation (regression guard)', () => {
  it('reproduces the deterministic benchmark results', async () => {
    const kb = seedKnowledgeBase();
    const results = [];
    for (const c of validatedSeed().benchmarkCases) results.push(await evaluateCase(c, kb, null));
    const summary = summarize(results, 'DETERMINISTIC_ONLY');
    // Only the Devanagari case (which needs AI normalisation) is expected to miss in deterministic mode.
    expect(results.filter((r) => !r.primaryHit).map((r) => r.caseId)).toEqual(['hindi-devanagari-ev']);
    expect(summary.meanGapRecall).toBe(1);
  });
});
