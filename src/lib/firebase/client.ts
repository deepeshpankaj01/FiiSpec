/**
 * Firebase Web SDK initialisation (browser only). Uses the local emulator
 * suite when NEXT_PUBLIC_USE_EMULATORS=true. No secrets live here: Firebase
 * web config values are public identifiers; privileged credentials stay in
 * Cloud Functions (Secret Manager).
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, type Functions, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, type FirebaseStorage, getStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'demo-fiispec.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-fiispec',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'demo-fiispec.appspot.com',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? 'demo-app-id',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' || config.projectId.startsWith('demo-');
export const FUNCTIONS_REGION = process.env.NEXT_PUBLIC_FUNCTIONS_REGION ?? 'asia-south1';
const EMULATOR_HOST = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? '127.0.0.1';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (typeof window === 'undefined') throw new Error('Firebase client SDK is only available in the browser.');
  if (services) return services;

  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);

  if (USE_EMULATORS) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    connectStorageEmulator(storage, EMULATOR_HOST, 9199);
    connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  } else if (process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY) {
    // App Check protects callable functions and Firebase APIs from non-app traffic.
    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    if (debugToken) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

  services = { app, auth, db, storage, functions };
  return services;
}
