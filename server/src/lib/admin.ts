import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Local development: the web app's emulator switch also points the Admin SDK at the emulators.
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT;
if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' || projectId?.startsWith('demo-')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
}

/**
 * Service account for production, from FIREBASE_SERVICE_ACCOUNT_KEY (the JSON
 * key file, raw or base64). Without it the SDK falls back to Application
 * Default Credentials, which is what the emulators and local scripts use.
 */
function serviceAccount(): ServiceAccount | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return undefined;
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(json) as ServiceAccount;
}

const account = serviceAccount();
const app = getApps()[0] ?? initializeApp({ ...(account ? { credential: cert(account) } : {}), ...(projectId ? { projectId } : {}) });

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

export const adminAuth = getAuth(app);
export const adminAppCheck = () => getAppCheck(app);

export const nowIso = (): string => new Date().toISOString();
