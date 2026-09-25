import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const officerA = { uid: 'officer-a', token: { role: 'PROCUREMENT_OFFICER', orgId: 'org-a' } };
const userA = { uid: 'user-a', token: { role: 'ORGANIZATION_USER', orgId: 'org-a' } };
const officerB = { uid: 'officer-b', token: { role: 'PROCUREMENT_OFFICER', orgId: 'org-b' } };
const inputPath = 'organizations/org-a/analyses/a-upload/input/tender.pdf';
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

const storageAs = (who: { uid: string; token: Record<string, string> }) => env.authenticatedContext(who.uid, who.token).storage();

beforeAll(async () => {
  // The Storage rules read the analysis record from Firestore (cross-service rules), so both
  // emulators use the same project id as the running emulator suite.
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'demo-fiispec',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../../../firebase/firestore.rules', import.meta.url)), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(fileURLToPath(new URL('../../../firebase/storage.rules', import.meta.url)), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'analyses/a-upload'), { orgId: 'org-a', createdBy: 'officer-a', status: 'AWAITING_UPLOAD', file: { storagePath: inputPath } });
    await setDoc(doc(db, 'analyses/a-done'), { orgId: 'org-a', createdBy: 'officer-a', status: 'COMPLETED', file: { storagePath: 'organizations/org-a/analyses/a-done/input/tender.pdf' } });
    await uploadBytes(ref(ctx.storage(), 'organizations/org-a/analyses/a-done/exports/report.pdf'), bytes, { contentType: PDF });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Storage rules', () => {
  it('rejects uploads from other organisations and other members', async () => {
    await assertFails(uploadBytes(ref(storageAs(officerB), inputPath), bytes, { contentType: PDF }));
    await assertFails(uploadBytes(ref(storageAs(userA), inputPath), bytes, { contentType: PDF }));
  });
  it('rejects unsupported file types and paths other than the declared one', async () => {
    await assertFails(uploadBytes(ref(storageAs(officerA), inputPath), bytes, { contentType: 'application/x-msdownload' }));
    await assertFails(uploadBytes(ref(storageAs(officerA), 'organizations/org-a/analyses/a-upload/input/other.pdf'), bytes, { contentType: PDF }));
    await assertFails(uploadBytes(ref(storageAs(officerA), 'organizations/org-a/analyses/a-upload/input/other.docx'), bytes, { contentType: DOCX }));
  });
  it('rejects oversized files', async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(storageAs(officerA), inputPath), big, { contentType: PDF }));
  });
  it('rejects uploads once the analysis is no longer awaiting a document', async () => {
    await assertFails(uploadBytes(ref(storageAs(officerA), 'organizations/org-a/analyses/a-done/input/tender.pdf'), bytes, { contentType: PDF }));
  });
  it('accepts the declared upload from the creating member', async () => {
    await assertSucceeds(uploadBytes(ref(storageAs(officerA), inputPath), bytes, { contentType: PDF }));
  });
  it('does not allow overwriting an uploaded document', async () => {
    await assertFails(uploadBytes(ref(storageAs(officerA), inputPath), bytes, { contentType: PDF }));
  });
  it('keeps uploaded documents and exports private to the organisation', async () => {
    await assertSucceeds(getBytes(ref(storageAs(userA), 'organizations/org-a/analyses/a-done/exports/report.pdf')));
    await assertFails(getBytes(ref(storageAs(officerB), 'organizations/org-a/analyses/a-done/exports/report.pdf')));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'organizations/org-a/analyses/a-done/exports/report.pdf')));
  });
  it('never allows clients to write exports or arbitrary paths', async () => {
    await assertFails(uploadBytes(ref(storageAs(officerA), 'organizations/org-a/analyses/a-done/exports/fake.pdf'), bytes, { contentType: PDF }));
    await assertFails(uploadBytes(ref(storageAs(officerA), 'public/anything.pdf'), bytes, { contentType: PDF }));
  });
});
