/**
 * Seeds the FiiSpec knowledge base (and, in the emulator only, demo users).
 *
 *   Emulator:   npm run seed                      (uses FIRESTORE_EMULATOR_HOST etc.)
 *   Production: GOOGLE_APPLICATION_CREDENTIALS=... GCLOUD_PROJECT=<id> npm run seed -- --kb-only
 *
 * Demo users are refused unless an emulator is targeted.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { PROMPT_REGISTRY } from '../src/ai/prompts';
import { validatedSeed } from '../src/seed';
import { RETRIEVED_AT } from '../src/seed/standards';

const kbOnly = process.argv.includes('--kb-only');
if (process.argv.includes('--emulator')) {
  // firebase-admin reads these when services are first used, so setting them here is sufficient.
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
}
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
process.env.GCLOUD_PROJECT ??= 'demo-fiispec';

if (!usingEmulator && !kbOnly) {
  console.error('Refusing to seed demo users outside the emulator. Use --kb-only for real projects.');
  process.exit(1);
}

const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const auth = getAuth(app);
const now = new Date().toISOString();

async function writeCollection(name: string, records: { id: string }[]): Promise<void> {
  const writer = db.bulkWriter();
  for (const record of records) {
    const { id, ...rest } = record;
    void writer.set(db.collection(name).doc(id), { ...rest, createdAt: now, updatedAt: now, updatedBy: 'seed' });
  }
  await writer.close();
  console.log(`  ${name}: ${records.length}`);
}

const seed = validatedSeed();
console.log(`Seeding knowledge base into ${usingEmulator ? 'emulator' : 'project'} ${process.env.GCLOUD_PROJECT}…`);
await writeCollection('standards', seed.standards);
await writeCollection('standardRelationships', seed.relationships);
await writeCollection('certificationRules', seed.certificationRules);
await writeCollection('productCategories', seed.categories);
await writeCollection('benchmarkCases', seed.benchmarkCases);

await db.collection('systemConfig').doc('prompts').set({ registry: PROMPT_REGISTRY, updatedAt: now });
// Signals running function instances to reload their cached knowledge base.
await db.collection('systemConfig').doc('kb').set({ updatedAt: now }, { merge: true });
await db.collection('systemConfig').doc('dataset').set({
  name: 'FiiSpec curated benchmark dataset',
  version: `curated-${RETRIEVED_AT}`,
  retrievedAt: RETRIEVED_AT,
  notice:
    'Small curated benchmark subset compiled from public BIS, MoP, CEA and BEE sources. It does not represent complete BIS coverage. Records are unverified until an administrator verifies them.',
  counts: { standards: seed.standards.length, relationships: seed.relationships.length, certificationRules: seed.certificationRules.length, categories: seed.categories.length },
  updatedAt: now,
});
const aiRef = db.collection('systemConfig').doc('ai');
if (!(await aiRef.get()).exists) await aiRef.set({ enabled: true, model: null, updatedAt: now });

if (!kbOnly) {
  console.log('Creating demo organisation and users (emulator only)…');
  const orgId = 'demo-directorate';
  const joinCode = 'DEMO-2026';
  const orgName = 'Demo Procurement Directorate';
  await db.collection('organizations').doc(orgId).set({ id: orgId, name: orgName, type: 'GOVERNMENT_DEPARTMENT', createdBy: 'seed', memberCount: 4, createdAt: now, updatedAt: now });
  await db.collection('organizations').doc(orgId).collection('private').doc('settings').set({ joinCode, updatedAt: now });
  await db.collection('joinCodes').doc(joinCode).set({ orgId, createdAt: now });

  const users = [
    { email: 'admin@fiispec.demo', name: 'Aditi Rao (Admin)', role: 'ADMIN' },
    { email: 'officer@fiispec.demo', name: 'Rahul Verma', role: 'PROCUREMENT_OFFICER' },
    { email: 'reviewer@fiispec.demo', name: 'Meera Iyer', role: 'REVIEWER' },
    { email: 'user@fiispec.demo', name: 'Karan Singh', role: 'ORGANIZATION_USER' },
  ] as const;
  for (const u of users) {
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(u.email)).uid;
    } catch {
      uid = (await auth.createUser({ email: u.email, password: 'FiiSpec#2026', displayName: u.name, emailVerified: true })).uid;
    }
    await auth.setCustomUserClaims(uid, { role: u.role, orgId });
    await db.collection('users').doc(uid).set({
      uid, email: u.email, displayName: u.name, orgId, orgName, role: u.role, language: 'en',
      notifications: { analysisCompleted: true, reviewAssigned: true }, claimsUpdatedAt: now, createdAt: now, updatedAt: now,
    });
    await db.collection('organizations').doc(orgId).collection('members').doc(uid).set({ uid, displayName: u.name, email: u.email, role: u.role, joinedAt: now });
    console.log(`  ${u.role.padEnd(20)} ${u.email}`);
  }
  console.log('Demo password for all users: FiiSpec#2026 (emulator only). Organisation join code: DEMO-2026');
}
console.log('Done.');
process.exit(0);
