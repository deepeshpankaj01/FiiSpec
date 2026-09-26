/**
 * Grants the platform ADMIN role to an existing user (keeps their organisation).
 *   npm run grant-admin -- --email someone@example.gov.in
 * Uses the emulator when FIREBASE_AUTH_EMULATOR_HOST is set, otherwise
 * Application Default Credentials for the project in GCLOUD_PROJECT.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const index = process.argv.indexOf('--email');
const email = index > -1 ? process.argv[index + 1] : undefined;
if (!email) {
  console.error('Usage: npm run grant-admin -- --email <address>');
  process.exit(1);
}
const app = getApps()[0] ?? initializeApp(process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : undefined);
const user = await getAuth(app).getUserByEmail(email);
const claims = user.customClaims ?? {};
await getAuth(app).setCustomUserClaims(user.uid, { ...claims, role: 'ADMIN' });
await getFirestore(app).collection('users').doc(user.uid).set({ role: 'ADMIN', claimsUpdatedAt: new Date().toISOString() }, { merge: true });
if (typeof claims.orgId === 'string') {
  await getFirestore(app).collection('organizations').doc(claims.orgId).collection('members').doc(user.uid).set({ role: 'ADMIN' }, { merge: true });
}
console.log(`Granted ADMIN to ${email}. The user must sign out and in again (or refresh their token).`);
process.exit(0);
