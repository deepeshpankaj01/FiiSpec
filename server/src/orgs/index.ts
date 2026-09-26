import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from '../lib/runtime';
import {
  CreateOrganizationSchema,
  JoinOrganizationSchema,
  UpdateMemberRoleSchema,
  UpdateProfileSchema,
} from '../../../shared/api';
import type { UserRole } from '../../../shared/constants';
import { adminAuth, db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { callerFrom, requirePermission } from '../lib/auth';
import { parseRequest } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`;
}

export interface UserProfileDoc {
  uid: string;
  email: string | null;
  displayName: string;
  orgId: string | null;
  orgName: string | null;
  role: UserRole | null;
  language: 'en' | 'hi';
  notifications: { analysisCompleted: boolean; reviewAssigned: boolean };
  claimsUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function setClaims(uid: string, claims: { orgId: string | null; role: UserRole | null }): Promise<void> {
  const user = await adminAuth.getUser(uid);
  const existing = user.customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, orgId: claims.orgId, role: claims.role });
}

/** Creates the minimal profile document on first sign-in. Stores no more personal data than name and email. */
export const bootstrapProfile = onCall(async (request) => {
  const caller = callerFrom(request);
  const ref = db.collection('users').doc(caller.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const existing = snap.data() as UserProfileDoc;
    // Registration sets the display name just after account creation; fill it in if we defaulted to the email.
    if (existing.displayName === existing.email && caller.name !== caller.email) {
      await ref.update({ displayName: caller.name, updatedAt: nowIso() });
      return { ...existing, displayName: caller.name };
    }
    return existing;
  }
  const now = nowIso();
  const profile: UserProfileDoc = {
    uid: caller.uid,
    email: caller.email,
    displayName: caller.name,
    orgId: caller.orgId,
    orgName: null,
    role: caller.role,
    language: 'en',
    notifications: { analysisCompleted: true, reviewAssigned: true },
    claimsUpdatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(profile);
  return profile;
});

export const updateProfile = onCall(async (request) => {
  const caller = callerFrom(request);
  const req = parseRequest(UpdateProfileSchema, request.data);
  await db.collection('users').doc(caller.uid).set({ displayName: req.displayName, language: req.language, notifications: req.notifications, updatedAt: nowIso() }, { merge: true });
  await adminAuth.updateUser(caller.uid, { displayName: req.displayName });
  if (caller.orgId) await db.collection('organizations').doc(caller.orgId).collection('members').doc(caller.uid).set({ displayName: req.displayName }, { merge: true });
  return { ok: true };
});

export const createOrganization = onCall(async (request) => {
  const caller = callerFrom(request);
  const req = parseRequest(CreateOrganizationSchema, request.data);
  if (caller.orgId) throw new HttpsError('failed-precondition', 'You already belong to an organization.');
  const orgRef = db.collection('organizations').doc();
  const code = generateJoinCode();
  const now = nowIso();
  // Platform administrators keep their ADMIN role; everyone else becomes the organization's procurement officer.
  const role: UserRole = caller.role === 'ADMIN' ? 'ADMIN' : 'PROCUREMENT_OFFICER';
  const batch = db.batch();
  batch.set(orgRef, { id: orgRef.id, name: req.name, type: req.type, createdBy: caller.uid, memberCount: 1, createdAt: now, updatedAt: now });
  batch.set(orgRef.collection('members').doc(caller.uid), { uid: caller.uid, displayName: caller.name, email: caller.email, role, joinedAt: now });
  batch.set(orgRef.collection('private').doc('settings'), { joinCode: code, updatedAt: now });
  batch.set(db.collection('joinCodes').doc(code), { orgId: orgRef.id, createdAt: now });
  batch.set(db.collection('users').doc(caller.uid), { orgId: orgRef.id, orgName: req.name, role, claimsUpdatedAt: now, updatedAt: now }, { merge: true });
  await batch.commit();
  await setClaims(caller.uid, { orgId: orgRef.id, role });
  await writeAudit({ action: 'ORG_CREATED', actorId: caller.uid, actorName: caller.name, actorRole: role, orgId: orgRef.id, targetType: 'organization', targetId: orgRef.id, summary: `Organization "${req.name}" created.` });
  return { orgId: orgRef.id };
});

export const joinOrganization = onCall(async (request) => {
  const caller = callerFrom(request);
  const { joinCode } = parseRequest(JoinOrganizationSchema, request.data);
  await enforceRateLimit(caller.uid, 'joinOrganization');
  if (caller.orgId) throw new HttpsError('failed-precondition', 'You already belong to an organization.');
  const codeSnap = await db.collection('joinCodes').doc(joinCode).get();
  const orgId = codeSnap.data()?.orgId as string | undefined;
  if (!orgId) throw new HttpsError('not-found', 'That join code is not valid.');
  const orgRef = db.collection('organizations').doc(orgId);
  const org = (await orgRef.get()).data() as { name: string } | undefined;
  if (!org) throw new HttpsError('not-found', 'That join code is not valid.');
  const role: UserRole = caller.role === 'ADMIN' ? 'ADMIN' : 'ORGANIZATION_USER';
  const now = nowIso();
  const batch = db.batch();
  batch.set(orgRef.collection('members').doc(caller.uid), { uid: caller.uid, displayName: caller.name, email: caller.email, role, joinedAt: now });
  batch.update(orgRef, { memberCount: FieldValue.increment(1), updatedAt: now });
  batch.set(db.collection('users').doc(caller.uid), { orgId, orgName: org.name, role, claimsUpdatedAt: now, updatedAt: now }, { merge: true });
  await batch.commit();
  await setClaims(caller.uid, { orgId, role });
  await writeAudit({ action: 'ORG_JOINED', actorId: caller.uid, actorName: caller.name, actorRole: role, orgId, targetType: 'organization', targetId: orgId, summary: `${caller.name} joined the organization.` });
  return { orgId };
});

export const updateMemberRole = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'manageMembers');
  const req = parseRequest(UpdateMemberRoleSchema, request.data);
  if (req.userId === caller.uid) throw new HttpsError('failed-precondition', 'You cannot change your own role.');
  const memberRef = db.collection('organizations').doc(caller.orgId).collection('members').doc(req.userId);
  const member = (await memberRef.get()).data() as { role: UserRole; displayName: string } | undefined;
  if (!member) throw new HttpsError('not-found', 'Member not found.');
  if (member.role === 'ADMIN') throw new HttpsError('permission-denied', 'Platform administrator roles are managed separately.');
  const now = nowIso();
  await memberRef.update({ role: req.role });
  await db.collection('users').doc(req.userId).set({ role: req.role, claimsUpdatedAt: now, updatedAt: now }, { merge: true });
  await setClaims(req.userId, { orgId: caller.orgId, role: req.role });
  await writeAudit({
    action: 'MEMBER_ROLE_CHANGED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    targetType: 'member',
    targetId: req.userId,
    summary: `${member.displayName}: ${member.role} → ${req.role}.`,
    metadata: { from: member.role, to: req.role },
  });
  return { ok: true };
});

export const regenerateJoinCode = onCall(async (request) => {
  const caller = requirePermission(callerFrom(request), 'manageMembers');
  const settingsRef = db.collection('organizations').doc(caller.orgId).collection('private').doc('settings');
  const old = (await settingsRef.get()).data()?.joinCode as string | undefined;
  const code = generateJoinCode();
  const batch = db.batch();
  if (old) batch.delete(db.collection('joinCodes').doc(old));
  batch.set(db.collection('joinCodes').doc(code), { orgId: caller.orgId, createdAt: nowIso() });
  batch.set(settingsRef, { joinCode: code, updatedAt: nowIso() }, { merge: true });
  await batch.commit();
  return { joinCode: code };
});
