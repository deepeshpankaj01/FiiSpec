/**
 * Integration-test helpers: seed the emulator with the curated knowledge base
 * (via the Admin SDK) and create signed-in client SDK sessions for test users.
 * Server API calls go through the real HTTP handlers (src/http) in-process,
 * authenticated with emulator ID tokens. Requires the Auth and Firestore emulators.
 */
import { deleteApp, initializeApp as initClient, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, doc, type Firestore, getFirestore, onSnapshot } from 'firebase/firestore';

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-fiispec';
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
export const PASSWORD = 'Test#12345';
const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const authEmulatorUrl = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;

// Imported after the emulator variables are set, so the server's Admin SDK targets the emulators too.
const { adminAuth, db: adminDb } = await import('../../src/lib/admin');
const { handleCallable, handleDocumentUpload } = await import('../../src/http/handlers');
const { validatedSeed } = await import('../../src/seed');
export { adminAuth, adminDb };

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
  uid: string;
  call: <Req, Res>(name: string, data: Req) => Promise<Res>;
  /** PUT a document to an upload path returned by createAnalysis. */
  upload: (uploadPath: string, body: Uint8Array, contentType: string) => Promise<void>;
  close: () => Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function unwrap<Res>(response: Response): Promise<Res> {
  const body = (await response.json()) as { result?: Res; error?: { code: string; message: string } };
  if (body.error) throw new ApiError(body.error.code, body.error.message);
  return body.result as Res;
}

let counter = 0;
export async function signIn(email: string): Promise<Session> {
  const app = initClient({ apiKey: 'demo-key', projectId: PROJECT_ID, appId: 'test' }, `test-${counter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost!, Number(firestorePort));
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  await cred.user.getIdToken(true);
  const headers = async () => ({ Authorization: `Bearer ${await cred.user.getIdToken()}` });
  return {
    app,
    db,
    uid: cred.user.uid,
    call: async <Req, Res>(name: string, data: Req) =>
      unwrap<Res>(await handleCallable(name, new Request(`http://localhost/api/fn/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify({ data }) }))),
    upload: async (uploadPath, body, contentType) => {
      const analysisId = /^\/api\/analyses\/([^/]+)\/document$/.exec(uploadPath)?.[1];
      if (!analysisId) throw new Error(`Unexpected upload path ${uploadPath}`);
      await unwrap(await handleDocumentUpload(analysisId, new Request(`http://localhost${uploadPath}`, { method: 'PUT', headers: { 'Content-Type': contentType, ...(await headers()) }, body })));
    },
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
