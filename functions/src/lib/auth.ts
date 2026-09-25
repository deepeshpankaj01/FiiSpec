/**
 * Server-side authorization. Roles and organisation membership come ONLY from
 * custom claims set by these functions (never from client-supplied data).
 */
import type { CallableRequest } from 'firebase-functions/https';
import { HttpsError } from 'firebase-functions/https';
import type { UserRole } from '../../../shared/constants';
import { USER_ROLES } from '../../../shared/constants';

export interface Caller {
  uid: string;
  email: string | null;
  name: string;
  role: UserRole | null;
  orgId: string | null;
}

export function callerFrom(request: CallableRequest<unknown>): Caller {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  const claims = auth.token as Record<string, unknown>;
  const role = typeof claims.role === 'string' && (USER_ROLES as readonly string[]).includes(claims.role) ? (claims.role as UserRole) : null;
  const orgId = typeof claims.orgId === 'string' && claims.orgId.length > 0 ? claims.orgId : null;
  const email = typeof auth.token.email === 'string' ? auth.token.email : null;
  const name = typeof auth.token.name === 'string' && auth.token.name ? auth.token.name : email ?? 'FiiSpec user';
  return { uid: auth.uid, email, name, role, orgId };
}

export type OrgCaller = Caller & { orgId: string; role: UserRole };

export function requireOrgMember(caller: Caller): OrgCaller {
  if (!caller.orgId || !caller.role) {
    throw new HttpsError('failed-precondition', 'Create or join an organization before continuing.');
  }
  return caller as OrgCaller;
}

export function requireRole(caller: Caller, allowed: UserRole[]): OrgCaller {
  const member = requireOrgMember(caller);
  if (!allowed.includes(member.role)) {
    throw new HttpsError('permission-denied', 'Your role does not permit this action.');
  }
  return member;
}

export function requireAdmin(caller: Caller): Caller & { role: 'ADMIN' } {
  if (caller.role !== 'ADMIN') throw new HttpsError('permission-denied', 'Administrator access is required.');
  return caller as Caller & { role: 'ADMIN' };
}

/** Pure permission matrix, unit-tested and mirrored in firebase/firestore.rules. */
export const PERMISSIONS = {
  createAnalysis: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'],
  generateSpecification: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'],
  editSpecification: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER'],
  approveSpecification: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER'],
  exportReport: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'],
  updateGapStatus: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER'],
  requestReview: ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'],
  decideReview: ['ADMIN', 'REVIEWER', 'PROCUREMENT_OFFICER'],
  manageMembers: ['ADMIN', 'PROCUREMENT_OFFICER'],
  manageKnowledgeBase: ['ADMIN'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | null, permission: Permission): boolean {
  return role !== null && (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

export function requirePermission(caller: Caller, permission: Permission): OrgCaller {
  const member = requireOrgMember(caller);
  if (!can(member.role, permission)) throw new HttpsError('permission-denied', 'Your role does not permit this action.');
  return member;
}

/** Analyses are organisation-scoped: a caller may only act on analyses of their own organisation. */
export function assertSameOrg(caller: OrgCaller, resourceOrgId: string | undefined): void {
  if (!resourceOrgId || resourceOrgId !== caller.orgId) {
    // Do not reveal whether the resource exists in another organisation.
    throw new HttpsError('not-found', 'Analysis not found.');
  }
}
