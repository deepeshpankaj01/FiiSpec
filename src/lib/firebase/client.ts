/**
 * Firebase Web SDK initialisation (browser only). Uses the local emulator
 * suite when NEXT_PUBLIC_USE_EMULATORS=true. No secrets live here: Firebase
 * web config values are public identifiers; privileged credentials stay in
 * the server API's environment (src/app/api).
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { type AppCheck, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore, getFirestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'demo-fiispec.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-fiispec',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'demo-fiispec.appspot.com',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? 'demo-app-id',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' || config.projectId.startsWith('demo-');
const EMULATOR_HOST = process.env.NEXT_PUBLIC_EMULATOR_HOST ?? '127.0.0.1';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  /** Set when App Check is configured; its token accompanies every server API call. */
  appCheck: AppCheck | null;
}

let services: FirebaseServices | null = null;

export function getFirebase(): FirebaseServices {
  if (typeof window === 'undefined') throw new Error('Firebase client SDK is only available in the browser.');
  if (services) return services;

  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let appCheck: AppCheck | null = null;

  if (USE_EMULATORS) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  } else if (process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY) {
    // App Check protects the server API and Firebase APIs from non-app traffic.
    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    if (debugToken) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

  services = { app, auth, db, appCheck };
  return services;
}
