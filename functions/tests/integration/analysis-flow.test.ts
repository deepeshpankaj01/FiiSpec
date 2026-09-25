/**
 * End-to-end backend flow against the Firebase Emulator Suite:
 * create analysis → trigger pipeline → results/graph/gaps/evidence → spec →
 * approval rules → export → document upload → abstention → access control.
 */
import { Document, Packer, Paragraph } from 'docx';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminDb, ensureUser, seedKnowledgeBaseIfEmpty, type Session, signIn, waitForStatus } from './helpers';

const ORG = 'itest-org';
const OTHER_ORG = 'itest-other-org';
let officer: Session;
let reviewer: Session;
let outsider: Session;
let analysisId: string;

beforeAll(async () => {
  await seedKnowledgeBaseIfEmpty();
  await ensureUser('itest-officer@fiispec.test', 'Integration Officer', { orgId: ORG, role: 'PROCUREMENT_OFFICER' });
  await ensureUser('itest-reviewer@fiispec.test', 'Integration Reviewer', { orgId: ORG, role: 'REVIEWER' });
  await ensureUser('itest-outsider@fiispec.test', 'Other Org Officer', { orgId: OTHER_ORG, role: 'PROCUREMENT_OFFICER' });
  officer = await signIn('itest-officer@fiispec.test');
  reviewer = await signIn('itest-reviewer@fiispec.test');
  outsider = await signIn('itest-outsider@fiispec.test');
});

afterAll(async () => {
  await Promise.all([officer?.close(), reviewer?.close(), outsider?.close()]);
});

describe('analysis pipeline (emulator)', () => {
  it('creates an analysis and processes it asynchronously to completion', async () => {
    // Optional fields left undefined by a browser form arrive as null through the callable protocol.
    const res = await officer.call<object, { analysisId: string; uploadPath: string | null }>('createAnalysis', {
      mode: 'DESCRIPTION',
      form: { description: '11 kW outdoor AC EV charger for public charging.', product: null, purpose: null, categoryHint: null },
      file: null,
    });
    analysisId = res.analysisId;
    expect(res.uploadPath).toBeNull();
    const done = await waitForStatus(officer.db, analysisId, ['COMPLETED', 'REVIEW_REQUIRED', 'FAILED']);
    expect(done.status).toBe('COMPLETED');
    const stages = done.stages as Record<string, { state: string }>;
    expect(stages.UNDERSTANDING?.state).toBe('DONE');
    expect(stages.REPORT?.state).toBe('DONE');
    expect(stages.UPLOADING?.state).toBe('SKIPPED');
  });

  it('stores results, graph, gaps and evidence readable by the organisation', async () => {
    const result = (await getDoc(doc(officer.db, 'analyses', analysisId, 'results', 'current'))).data()!;
    const primary = (result.recommendations as { tier: string; standardId: string }[]).filter((r) => r.tier === 'PRIMARY');
    expect(primary[0]?.standardId).toBe('is-17017-1');
    const graph = (await getDoc(doc(officer.db, 'analyses', analysisId, 'graph', 'current'))).data()!;
    expect((graph.nodes as unknown[]).length).toBeGreaterThan(5);
    const gaps = await getDocs(query(collection(officer.db, 'analyses', analysisId, 'gaps'), where('orgId', '==', ORG)));
    expect(gaps.docs.map((d) => d.data().code)).toContain('MISSING_PARAMETER:connector_type');
    const evidence = await getDocs(query(collection(officer.db, 'analyses', analysisId, 'evidence'), where('orgId', '==', ORG)));
    expect(evidence.size).toBeGreaterThan(10);
  });

  it('writes an audit trail for the analysis', async () => {
    const logs = await getDocs(query(collection(officer.db, 'auditLogs'), where('orgId', '==', ORG), where('analysisId', '==', analysisId)));
    const actions = logs.docs.map((d) => d.data().action);
    expect(actions).toEqual(expect.arrayContaining(['ANALYSIS_CREATED', 'ANALYSIS_PROCESSING_STARTED', 'ANALYSIS_COMPLETED']));
  });

  it('isolates organisations: another organisation cannot read the analysis or its results', async () => {
    const denied = { code: 'permission-denied' };
    await expect(getDoc(doc(outsider.db, 'analyses', analysisId))).rejects.toMatchObject(denied);
    await expect(getDoc(doc(outsider.db, 'analyses', analysisId, 'results', 'current'))).rejects.toMatchObject(denied);
    await expect(getDoc(doc(outsider.db, 'analyses', analysisId, 'inputs', 'primary'))).rejects.toMatchObject(denied);
    await expect(getDocs(query(collection(outsider.db, 'analyses'), where('orgId', '==', ORG)))).rejects.toMatchObject(denied);
    await expect(outsider.call('generateProcurementSpecification', { analysisId })).rejects.toThrow(/not found/i);
  });

  it('generates a procurement specification and blocks approval while placeholders remain', async () => {
    const { specId } = await officer.call<object, { specId: string }>('generateProcurementSpecification', { analysisId });
    const spec = (await getDoc(doc(officer.db, 'analyses', analysisId, 'specifications', specId))).data()!;
    expect(spec.status).toBe('AI_DRAFT');
    expect(spec.sections).toHaveLength(10);
    await expect(reviewer.call('approveSpecification', { analysisId, specId })).rejects.toThrow(/placeholder/i);

    // Resolve placeholders by editing, then approve.
    const sections = (spec.sections as { key: string; items: { text: string; origin: string; standardIds: string[] }[] }[]).map((s) => ({
      key: s.key,
      items: s.items.map((i) => (i.origin === 'GAP_PLACEHOLDER' ? { ...i, text: i.text.replace(/\[To be specified by purchaser: ([^\]]+)\]/, 'Specified: $1'), origin: 'HUMAN_EDIT' } : i)).map((i) => (i.origin === 'GAP_PLACEHOLDER' ? { ...i, text: `Resolved: ${i.text}`, origin: 'HUMAN_EDIT' } : i)),
    }));
    await reviewer.call('saveSpecificationDraft', { analysisId, specId, sections });
    await reviewer.call('approveSpecification', { analysisId, specId, note: 'Checked in integration test' });
    const approved = (await getDoc(doc(officer.db, 'analyses', analysisId, 'specifications', specId))).data()!;
    expect(approved.status).toBe('HUMAN_REVIEWED');
    expect(approved.approvedByName).toBe('Integration Reviewer');
  });

  it('exports PDF and DOCX reports and records the export', async () => {
    const pdf = await officer.call<object, { contentBase64: string; fileName: string }>('exportReport', { analysisId, format: 'PDF' });
    expect(Buffer.from(pdf.contentBase64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    const docx = await officer.call<object, { contentBase64: string }>('exportReport', { analysisId, format: 'DOCX' });
    expect(Buffer.from(docx.contentBase64, 'base64')[0]).toBe(0x50);
    const exports = await getDocs(query(collection(officer.db, 'analyses', analysisId, 'exports'), where('orgId', '==', ORG)));
    expect(exports.size).toBeGreaterThanOrEqual(2);
  });

  it('updates gap status and recomputes readiness', async () => {
    const gaps = await getDocs(query(collection(officer.db, 'analyses', analysisId, 'gaps'), where('orgId', '==', ORG)));
    const connector = gaps.docs.find((d) => d.data().code === 'MISSING_PARAMETER:connector_type')!;
    const before = ((await getDoc(doc(officer.db, 'analyses', analysisId, 'results', 'current'))).data()!.readiness as { score: number }).score;
    await reviewer.call('updateGapStatus', { analysisId, gapId: connector.id, status: 'RESOLVED', note: 'Type 2 socket confirmed' });
    const after = ((await getDoc(doc(officer.db, 'analyses', analysisId, 'results', 'current'))).data()!.readiness as { score: number }).score;
    expect(after).toBeGreaterThan(before);
  });

  it('processes an uploaded DOCX tender document', async () => {
    const buffer = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph('Supply of 500 MT Ordinary Portland Cement 43 grade conforming to IS 8112:1989 in 50 kg bags.'),
              new Paragraph('Cement shall be of reputed make.'),
            ],
          },
        ],
      }),
    );
    const res = await officer.call<object, { analysisId: string; uploadPath: string }>('createAnalysis', {
      mode: 'DOCUMENT',
      form: { product: 'OPC cement' },
      file: { name: 'cement tender.docx', size: buffer.length, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    });
    expect(res.uploadPath).toMatch(new RegExp(`^organizations/${ORG}/analyses/${res.analysisId}/input/`));
    await uploadBytes(ref(officer.storage, res.uploadPath), new Uint8Array(buffer), { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const done = await waitForStatus(officer.db, res.analysisId, ['COMPLETED', 'REVIEW_REQUIRED', 'FAILED']);
    expect(done.status).toBe('COMPLETED');
    const result = (await getDoc(doc(officer.db, 'analyses', res.analysisId, 'results', 'current'))).data()!;
    const versions = result.versionFindings as { citedAs: string | null; state: string }[];
    expect(versions.find((v) => v.citedAs === 'IS 8112:1989')?.state).toBe('SUPERSEDED');
  });

  it('rejects uploads that do not match the analysis record', async () => {
    const res = await officer.call<object, { analysisId: string; uploadPath: string }>('createAnalysis', {
      mode: 'DOCUMENT',
      form: {},
      file: { name: 'spec.pdf', size: 20, contentType: 'application/pdf' },
    });
    // Wrong file name/path for this analysis → denied by Storage rules.
    await expect(uploadBytes(ref(officer.storage, `organizations/${ORG}/analyses/${res.analysisId}/input/other.pdf`), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' })).rejects.toThrow();
    // Another organisation cannot upload into this analysis.
    await expect(uploadBytes(ref(outsider.storage, res.uploadPath), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' })).rejects.toThrow();
  });

  it('marks an invalid document as failed with a user-friendly error', async () => {
    const res = await officer.call<object, { analysisId: string; uploadPath: string }>('createAnalysis', {
      mode: 'DOCUMENT',
      form: {},
      file: { name: 'fake.pdf', size: 26, contentType: 'application/pdf' },
    });
    await uploadBytes(ref(officer.storage, res.uploadPath), new TextEncoder().encode('this is not really a pdf!!'), { contentType: 'application/pdf' });
    const failed = await waitForStatus(officer.db, res.analysisId, ['FAILED', 'COMPLETED']);
    expect(failed.status).toBe('FAILED');
    expect((failed.error as { code: string }).code).toBe('INVALID_FILE');
  });

  it('abstains on out-of-scope input and creates a review task', async () => {
    const { analysisId: id } = await officer.call<object, { analysisId: string }>('createAnalysis', {
      mode: 'DESCRIPTION',
      form: { description: 'Ergonomic office chairs with mesh back and adjustable armrests.' },
    });
    const done = await waitForStatus(officer.db, id, ['COMPLETED', 'REVIEW_REQUIRED', 'FAILED']);
    expect(done.status).toBe('REVIEW_REQUIRED');
    const tasks = await getDocs(query(collection(reviewer.db, 'reviewTasks'), where('orgId', '==', ORG), where('analysisId', '==', id)));
    expect(tasks.size).toBe(1);
    expect(tasks.docs[0]!.data().trigger).toBe('ABSTENTION');
  });

  it('enforces reviewer independence and role permissions', async () => {
    const { taskId } = await officer.call<object, { taskId: string }>('requestReview', { analysisId, reason: 'Please confirm connector and certification.' });
    await expect(officer.call('submitReview', { taskId, decision: 'APPROVED' })).rejects.toThrow(/different member/i);
    await reviewer.call('submitReview', { taskId, decision: 'APPROVED', note: 'Confirmed' });
    const task = (await adminDb.collection('reviewTasks').doc(taskId).get()).data()!;
    expect(task.status).toBe('APPROVED');
    await expect(officer.call('adminVerifyRecord', { collection: 'standards', id: 'is-269', status: 'VERIFIED', note: 'not allowed' })).rejects.toThrow(/Administrator/i);
  });

  it('reports a version as current only after an administrator verifies it (cache refreshes across instances)', async () => {
    await ensureUser('itest-admin@fiispec.test', 'Integration Admin', { orgId: 'itest-admin-org', role: 'ADMIN' });
    const admin = await signIn('itest-admin@fiispec.test');
    try {
      const before = (await getDoc(doc(officer.db, 'analyses', analysisId, 'results', 'current'))).data()!;
      const stateOf = (r: Record<string, unknown>) => (r.versionFindings as { standardId: string; origin: string; state: string }[]).find((v) => v.origin === 'RECOMMENDATION' && v.standardId === 'is-17017-1')?.state;
      expect(stateOf(before)).toBe('REQUIRES_VERIFICATION');
      await admin.call('adminVerifyRecord', { collection: 'standards', id: 'is-17017-1', status: 'VERIFIED', note: 'Checked BIS e-Sale listing (integration test)' });
      await officer.call('retryAnalysis', { analysisId });
      await waitForStatus(officer.db, analysisId, ['PROCESSING', 'QUEUED'], 30_000).catch(() => undefined);
      await waitForStatus(officer.db, analysisId, ['COMPLETED', 'REVIEW_REQUIRED', 'FAILED']);
      const after = (await getDoc(doc(officer.db, 'analyses', analysisId, 'results', 'current'))).data()!;
      expect(stateOf(after)).toBe('CURRENT_VERIFIED');
      const rec = (after.recommendations as { standardId: string; provenanceClass: string }[]).find((r) => r.standardId === 'is-17017-1');
      expect(rec?.provenanceClass).toBe('VERIFIED_OFFICIAL');
    } finally {
      // Restore the unverified state so other runs start from the honest baseline.
      await admin.call('adminVerifyRecord', { collection: 'standards', id: 'is-17017-1', status: 'UNVERIFIED', note: 'Reset after integration test' });
      await admin.close();
    }
  });

  it('never lets clients write analysis data directly', async () => {
    const { setDoc } = await import('firebase/firestore');
    const denied = { code: 'permission-denied' };
    await expect(setDoc(doc(officer.db, 'analyses', analysisId), { status: 'COMPLETED' }, { merge: true })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(officer.db, 'standards', 'is-fake'), { title: 'x' })).rejects.toMatchObject(denied);
    await expect(setDoc(doc(officer.db, 'auditLogs', 'forged'), { action: 'X' })).rejects.toMatchObject(denied);
  });
});
