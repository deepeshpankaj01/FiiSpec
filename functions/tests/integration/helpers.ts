/**
 * Integration-test helpers: seed the emulator with the curated knowledge base
 * (via the Admin SDK) and create signed-in client SDK sessions for test users.
 * Requires the Auth, Firestore, Storage and Functions emulators.
 */
import { deleteApp, initializeApp as initClient, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, doc, type Firestore, getFirestore, onSnapshot } from 'firebase/firestore';
import { connectFunctionsEmulator, type Functions, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, type FirebaseStorage, getStorage } from 'firebase/storage';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { validatedSeed } from '../../src/seed';

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-fiispec';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
export const BUCKET = `${PROJECT_ID}.appspot.com`;
export const PASSWORD = 'Test#12345';

const admin = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
export const adminDb = getAdminFirestore(admin);
export const adminAuth = getAdminAuth(admin);

export async function seedKnowledgeBaseIfEmpty(): Promise<void> {
  const existing = await adminDb.collection('standards').limit(1).get();
  if (!existing.empty) return;
  const seed = validatedSeed();
  const writer = adminDb.bulkWriter();
  const put = (col: string, records: { id: string }[]) => {
    for (const { id, ...rest } of records) void writer.set(adminDb.collection(col).doc(id), rest);
  };
  put('standards', seed.standards);
  put('standardRelationships', seed.relationships);
  put('certificationRules', seed.certificationRules);
  put('productCategories', seed.categories);
  put('benchmarkCases', seed.benchmarkCases);
  await writer.close();
}

/** Create (or reuse) a user and optionally attach them to an organisation with a role. */
export async function ensureUser(email: string, name: string, org?: { orgId: string; role: string }): Promise<string> {
  let uid: string;
  try {
    uid = (await adminAuth.getUserByEmail(email)).uid;
  } catch {
    uid = (await adminAuth.createUser({ email, password: PASSWORD, displayName: name })).uid;
  }
  if (org) {
    await adminAuth.setCustomUserClaims(uid, { orgId: org.orgId, role: org.role });
    await adminDb.collection('organizations').doc(org.orgId).set({ id: org.orgId, name: `Test org ${org.orgId}`, type: 'OTHER', memberCount: 1 }, { merge: true });
    await adminDb.collection('organizations').doc(org.orgId).collection('members').doc(uid).set({ uid, displayName: name, email, role: org.role });
  }
  return uid;
}

export interface Session {
  app: FirebaseApp;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
  uid: string;
  call: <Req, Res>(name: string, data: Req) => Promise<Res>;
  close: () => Promise<void>;
}

let counter = 0;
export async function signIn(email: string): Promise<Session> {
  const app = initClient({ apiKey: 'demo-key', projectId: PROJECT_ID, storageBucket: BUCKET, appId: 'test' }, `test-${counter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  const functions = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  await cred.user.getIdToken(true);
  return {
    app,
    db,
    storage,
    functions,
    uid: cred.user.uid,
    call: async <Req, Res>(name: string, data: Req) => (await httpsCallable<Req, Res>(functions, name, { timeout: 120_000 })(data)).data,
    close: () => deleteApp(app),
  };
}

/** Wait until the analysis document reaches one of the given statuses. */
export function waitForStatus(db: Firestore, analysisId: string, statuses: string[], timeoutMs = 90_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timed out waiting for ${statuses.join('/')}`));
    }, timeoutMs);
    const unsub = onSnapshot(
      doc(db, 'analyses', analysisId),
      (snap) => {
        const data = snap.data();
        if (data && statuses.includes(data.status as string)) {
          clearTimeout(timer);
          unsub();
          resolve(data);
        }
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
