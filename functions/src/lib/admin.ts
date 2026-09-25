import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const app = getApps()[0] ?? initializeApp();

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

export const adminAuth = getAuth(app);
export const bucket = () => getStorage(app).bucket();

export const nowIso = (): string => new Date().toISOString();
