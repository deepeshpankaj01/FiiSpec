import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const officerA = { uid: 'officer-a', token: { role: 'PROCUREMENT_OFFICER', orgId: 'org-a' } };
const userA = { uid: 'user-a', token: { role: 'ORGANIZATION_USER', orgId: 'org-a' } };
const officerB = { uid: 'officer-b', token: { role: 'PROCUREMENT_OFFICER', orgId: 'org-b' } };
const admin = { uid: 'admin-1', token: { role: 'ADMIN', orgId: 'org-admin' } };
const noOrg = { uid: 'new-user', token: {} };

const as = (who: { uid: string; token: Record<string, string> }) => env.authenticatedContext(who.uid, who.token).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'demo-fiispec',
    firestore: { rules: readFileSync(fileURLToPath(new URL('../../../firebase/firestore.rules', import.meta.url)), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'analyses/a1'), { orgId: 'org-a', createdBy: 'officer-a', status: 'COMPLETED', createdAt: '2026-09-25' });
    await setDoc(doc(db, 'analyses/a1/results/current'), { orgId: 'org-a', analysisId: 'a1' });
    await setDoc(doc(db, 'analyses/a1/inputs/primary'), { orgId: 'org-a', text: 'confidential tender text' });
    await setDoc(doc(db, 'analyses/a1/gaps/g1'), { orgId: 'org-a', code: 'X' });
    await setDoc(doc(db, 'standards/s-pub'), { lifecycle: 'PUBLISHED', title: 'Published' });
    await setDoc(doc(db, 'standards/s-draft'), { lifecycle: 'DRAFT', title: 'Draft' });
    await setDoc(doc(db, 'users/officer-a'), { uid: 'officer-a', orgId: 'org-a' });
    await setDoc(doc(db, 'organizations/org-a'), { name: 'Org A' });
    await setDoc(doc(db, 'organizations/org-a/private/settings'), { joinCode: 'ABCD-1234' });
    await setDoc(doc(db, 'organizations/org-a/members/officer-a'), { role: 'PROCUREMENT_OFFICER' });
    await setDoc(doc(db, 'auditLogs/l1'), { orgId: 'org-a', analysisId: 'a1', action: 'ANALYSIS_CREATED', at: '2026-09-25' });
    await setDoc(doc(db, 'auditLogs/l2'), { orgId: null, action: 'KB_RECORD_UPDATED', at: '2026-09-25' });
    await setDoc(doc(db, 'reviewTasks/t1'), { orgId: 'org-a', status: 'OPEN', createdAt: '2026-09-25' });
    await setDoc(doc(db, 'feedback/f1'), { userId: 'user-a', status: 'OPEN' });
    await setDoc(doc(db, 'rateLimits/officer-a_createAnalysis'), { count: 1 });
    await setDoc(doc(db, 'joinCodes/ABCD-1234'), { orgId: 'org-a' });
    await setDoc(doc(db, 'analysisJobs/j1'), { analysisId: 'a1' });
    await setDoc(doc(db, 'systemConfig/ai'), { enabled: true });
  });
});

const FIXTURES = [
  'analyses/a1/results/current', 'analyses/a1/inputs/primary', 'analyses/a1/gaps/g1', 'analyses/a1', 'standards/s-pub', 'standards/s-draft', 'users/officer-a',
  'organizations/org-a/private/settings', 'organizations/org-a/members/officer-a', 'organizations/org-a', 'auditLogs/l1', 'auditLogs/l2', 'reviewTasks/t1',
  'feedback/f1', 'rateLimits/officer-a_createAnalysis', 'joinCodes/ABCD-1234', 'analysisJobs/j1',
];

afterAll(async () => {
  // Remove fixtures so the suite can also run against a developer's emulator without leaving test data behind.
  await env?.withSecurityRulesDisabled(async (ctx) => {
    const { deleteDoc } = await import('firebase/firestore');
    for (const path of FIXTURES) await deleteDoc(doc(ctx.firestore(), path));
  });
  await env?.cleanup();
});

describe('Firestore rules — knowledge base', () => {
  it('denies unauthenticated access to everything', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'standards/s-pub')));
    await assertFails(getDoc(doc(db, 'analyses/a1')));
  });
  it('lets signed-in users read published standards only', async () => {
    await assertSucceeds(getDoc(doc(as(userA), 'standards/s-pub')));
    await assertFails(getDoc(doc(as(userA), 'standards/s-draft')));
    await assertSucceeds(getDocs(query(collection(as(noOrg), 'standards'), where('lifecycle', '==', 'PUBLISHED'))));
    await assertFails(getDocs(collection(as(userA), 'standards')));
  });
  it('lets admins read drafts', async () => {
    await assertSucceeds(getDoc(doc(as(admin), 'standards/s-draft')));
  });
  it('denies all client writes to the knowledge base, even for admins', async () => {
    await assertFails(setDoc(doc(as(admin), 'standards/s-new'), { lifecycle: 'PUBLISHED' }));
    await assertFails(setDoc(doc(as(officerA), 'certificationRules/r1'), { lifecycle: 'PUBLISHED' }));
    await assertFails(setDoc(doc(as(officerA), 'standardRelationships/x'), { lifecycle: 'PUBLISHED' }));
  });
});

describe('Firestore rules — organisation isolation', () => {
  it('lets organisation members read their analyses, results and inputs', async () => {
    await assertSucceeds(getDoc(doc(as(userA), 'analyses/a1')));
    await assertSucceeds(getDoc(doc(as(userA), 'analyses/a1/results/current')));
    await assertSucceeds(getDoc(doc(as(userA), 'analyses/a1/inputs/primary')));
    await assertSucceeds(getDocs(query(collection(as(userA), 'analyses/a1/gaps'), where('orgId', '==', 'org-a'))));
  });
  it('denies other organisations', async () => {
    await assertFails(getDoc(doc(as(officerB), 'analyses/a1')));
    await assertFails(getDoc(doc(as(officerB), 'analyses/a1/results/current')));
    await assertFails(getDoc(doc(as(officerB), 'analyses/a1/inputs/primary')));
    await assertFails(getDocs(query(collection(as(officerB), 'analyses'), where('orgId', '==', 'org-a'))));
  });
  it('requires list queries to be scoped to the caller organisation', async () => {
    await assertFails(getDocs(collection(as(userA), 'analyses')));
    await assertSucceeds(getDocs(query(collection(as(userA), 'analyses'), where('orgId', '==', 'org-a'))));
  });
  it('lets admins read analysis metadata and results but never raw inputs', async () => {
    await assertSucceeds(getDoc(doc(as(admin), 'analyses/a1')));
    await assertSucceeds(getDoc(doc(as(admin), 'analyses/a1/results/current')));
    await assertFails(getDoc(doc(as(admin), 'analyses/a1/inputs/primary')));
  });
  it('denies users without an organisation', async () => {
    await assertFails(getDoc(doc(as(noOrg), 'analyses/a1')));
  });
  it('never allows clients to write analyses or results', async () => {
    await assertFails(setDoc(doc(as(officerA), 'analyses/a2'), { orgId: 'org-a' }));
    await assertFails(setDoc(doc(as(officerA), 'analyses/a1'), { status: 'COMPLETED' }, { merge: true }));
    await assertFails(setDoc(doc(as(officerA), 'analyses/a1/results/current'), { orgId: 'org-a' }));
  });
  it('does not trust client-supplied role values', async () => {
    // A forged "role" field in a client write is irrelevant: users cannot write their profile at all.
    await assertFails(setDoc(doc(as(userA), 'users/user-a'), { role: 'ADMIN' }));
    await assertFails(setDoc(doc(as(userA), 'organizations/org-a/members/user-a'), { role: 'ADMIN' }));
  });
});

describe('Firestore rules — profiles, organisations, audit, reviews', () => {
  it('lets users read only their own profile', async () => {
    await assertSucceeds(getDoc(doc(as(officerA), 'users/officer-a')));
    await assertFails(getDoc(doc(as(userA), 'users/officer-a')));
  });
  it('restricts the join code to procurement officers of the organisation', async () => {
    await assertSucceeds(getDoc(doc(as(officerA), 'organizations/org-a/private/settings')));
    await assertFails(getDoc(doc(as(userA), 'organizations/org-a/private/settings')));
    await assertFails(getDoc(doc(as(officerB), 'organizations/org-a/private/settings')));
  });
  it('scopes audit logs to the organisation; admins see all', async () => {
    await assertSucceeds(getDocs(query(collection(as(userA), 'auditLogs'), where('orgId', '==', 'org-a'), where('analysisId', '==', 'a1'))));
    await assertFails(getDocs(query(collection(as(officerB), 'auditLogs'), where('orgId', '==', 'org-a'))));
    await assertFails(getDoc(doc(as(userA), 'auditLogs/l2')));
    await assertSucceeds(getDoc(doc(as(admin), 'auditLogs/l2')));
    await assertFails(setDoc(doc(as(admin), 'auditLogs/forged'), { action: 'X' }));
  });
  it('scopes review tasks to the organisation', async () => {
    await assertSucceeds(getDoc(doc(as(userA), 'reviewTasks/t1')));
    await assertFails(getDoc(doc(as(officerB), 'reviewTasks/t1')));
  });
  it('lets users read only their own feedback', async () => {
    await assertSucceeds(getDoc(doc(as(userA), 'feedback/f1')));
    await assertFails(getDoc(doc(as(officerA), 'feedback/f1')));
    await assertSucceeds(getDoc(doc(as(admin), 'feedback/f1')));
  });
  it('keeps server-only collections closed', async () => {
    for (const path of ['rateLimits/officer-a_createAnalysis', 'joinCodes/ABCD-1234', 'analysisJobs/j1']) {
      await assertFails(getDoc(doc(as(admin), path)));
      await assertFails(getDoc(doc(as(officerA), path)));
    }
  });
  it('restricts system configuration to admins', async () => {
    await assertFails(getDoc(doc(as(officerA), 'systemConfig/ai')));
    await assertSucceeds(getDoc(doc(as(admin), 'systemConfig/ai')));
  });
});
