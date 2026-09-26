/**
 * Typed wrappers around the server API (POST /api/fn/{name}, see
 * src/app/api). Request payload types come from the shared Zod schemas, so the
 * client and server stay in sync. Errors surface as FirebaseError with
 * `functions/<code>` codes, as with Firebase callable functions.
 */
import { FirebaseError } from 'firebase/app';
import { getToken } from 'firebase/app-check';
import type { z } from 'zod';
import type {
  AdminIngestionDecisionSchema,
  AdminResolveFeedbackSchema,
  AdminRunBenchmarksSchema,
  AdminSetLifecycleSchema,
  AdminStageIngestionSchema,
  AdminUpsertBenchmarkCaseSchema,
  AdminUpsertCertificationRuleSchema,
  AdminUpsertRelationshipSchema,
  AdminUpsertStandardSchema,
  AdminVerifyRecordSchema,
  AnalysisRefSchema,
  ApproveSpecificationSchema,
  CreateAnalysisRequest,
  CreateOrganizationRequest,
  ExportReportSchema,
  JoinOrganizationSchema,
  RequestReviewSchema,
  SaveSpecificationSchema,
  SearchStandardsSchema,
  SubmitFeedbackSchema,
  SubmitReviewSchema,
  UpdateGapStatusSchema,
  UpdateMemberRoleSchema,
  UpdateProfileRequest,
} from '@shared/api';
import { getFirebase } from './client';

export interface StandardSearchHit {
  id: string;
  standardNumber: string;
  designation: string;
  title: string;
  sector: string;
  kind: string;
  status: string;
  verificationStatus: string;
  dataOrigin: string;
  matchedOn: 'NUMBER' | 'TEXT';
}

export interface BenchmarkSummary {
  cases: number;
  primaryHitRate: number;
  meanStandardRecall: number;
  meanStandardPrecision: number;
  meanGapRecall: number | null;
  abstentionAccuracy: number;
  aiMode: 'AI_ASSISTED' | 'DETERMINISTIC_ONLY';
}

/** Remove undefined fields (the callable protocol would otherwise send them as null). */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, withoutUndefined(v)])) as T;
  }
  return value;
}

/** The server API allows 300 s per request (Vercel maxDuration). */
const REQUEST_TIMEOUT_MS = 300_000;

async function authHeaders(): Promise<Record<string, string>> {
  const { auth, appCheck } = getFirebase();
  const headers: Record<string, string> = {};
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (appCheck) headers['X-Firebase-AppCheck'] = (await getToken(appCheck)).token;
  return headers;
}

/** Turn an API response body into its result, or throw the FirebaseError it describes. */
function unwrap<Res>(status: number, body: unknown): Res {
  const payload = (body ?? {}) as { result?: Res; error?: { code?: string; message?: string } };
  if (status >= 200 && status < 300 && 'result' in payload) return payload.result as Res;
  throw new FirebaseError(`functions/${payload.error?.code ?? 'internal'}`, payload.error?.message ?? 'Request failed');
}

function callable<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => {
    let response: Response;
    try {
      response = await fetch(`/api/fn/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ data: withoutUndefined(data) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') throw new FirebaseError('functions/deadline-exceeded', 'Request timed out');
      throw new FirebaseError('functions/unavailable', 'Network request failed');
    }
    return unwrap<Res>(response.status, await response.json().catch(() => null));
  };
}

/** Send a tender document to the upload path returned by createAnalysis, reporting progress (0–100). */
export async function uploadDocument(path: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  const headers = await authHeaders();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', path);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        unwrap(xhr.status, JSON.parse(xhr.responseText || 'null'));
        resolve();
      } catch (error) {
        reject(error instanceof FirebaseError ? error : new FirebaseError('functions/internal', 'Upload failed'));
      }
    };
    xhr.onerror = () => reject(new FirebaseError('functions/unavailable', 'Network request failed'));
    xhr.ontimeout = () => reject(new FirebaseError('functions/deadline-exceeded', 'Upload timed out'));
    xhr.send(file);
  });
}

type In<T extends z.ZodType> = z.input<T>;

export const api = {
  bootstrapProfile: callable<Record<string, never>, unknown>('bootstrapProfile'),
  updateProfile: callable<UpdateProfileRequest, { ok: true }>('updateProfile'),
  createOrganization: callable<CreateOrganizationRequest, { orgId: string }>('createOrganization'),
  joinOrganization: callable<In<typeof JoinOrganizationSchema>, { orgId: string }>('joinOrganization'),
  updateMemberRole: callable<In<typeof UpdateMemberRoleSchema>, { ok: true }>('updateMemberRole'),
  regenerateJoinCode: callable<Record<string, never>, { joinCode: string }>('regenerateJoinCode'),

  createAnalysis: callable<CreateAnalysisRequest, { analysisId: string; uploadPath: string | null }>('createAnalysis'),
  retryAnalysis: callable<In<typeof AnalysisRefSchema>, { ok: true }>('retryAnalysis'),
  updateGapStatus: callable<In<typeof UpdateGapStatusSchema>, { ok: true }>('updateGapStatus'),
  requestReview: callable<In<typeof RequestReviewSchema>, { taskId: string }>('requestReview'),
  submitReview: callable<In<typeof SubmitReviewSchema>, { ok: true }>('submitReview'),
  submitFeedback: callable<In<typeof SubmitFeedbackSchema>, { ok: true }>('submitFeedback'),
  generateProcurementSpecification: callable<In<typeof AnalysisRefSchema>, { specId: string }>('generateProcurementSpecification'),
  saveSpecificationDraft: callable<In<typeof SaveSpecificationSchema>, { ok: true }>('saveSpecificationDraft'),
  approveSpecification: callable<In<typeof ApproveSpecificationSchema>, { ok: true }>('approveSpecification'),
  exportReport: callable<In<typeof ExportReportSchema>, { fileName: string; mimeType: string; contentBase64: string }>('exportReport'),
  searchStandards: callable<In<typeof SearchStandardsSchema>, { hits: StandardSearchHit[]; total: number }>('searchStandards'),

  adminUpsertStandard: callable<In<typeof AdminUpsertStandardSchema>, { created: boolean }>('adminUpsertStandard'),
  adminUpsertRelationship: callable<In<typeof AdminUpsertRelationshipSchema>, { created: boolean }>('adminUpsertRelationship'),
  adminUpsertCertificationRule: callable<In<typeof AdminUpsertCertificationRuleSchema>, { created: boolean }>('adminUpsertCertificationRule'),
  adminUpsertBenchmarkCase: callable<In<typeof AdminUpsertBenchmarkCaseSchema>, { created: boolean }>('adminUpsertBenchmarkCase'),
  adminSetLifecycle: callable<In<typeof AdminSetLifecycleSchema>, { ok: true }>('adminSetLifecycle'),
  adminVerifyRecord: callable<In<typeof AdminVerifyRecordSchema>, { ok: true }>('adminVerifyRecord'),
  adminStageIngestion: callable<In<typeof AdminStageIngestionSchema>, { ingestionId: string; valid: number; invalid: number }>('adminStageIngestion'),
  adminDecideIngestion: callable<In<typeof AdminIngestionDecisionSchema>, { published: number }>('adminDecideIngestion'),
  adminRunBenchmarks: callable<In<typeof AdminRunBenchmarksSchema>, { runId: string; summary: BenchmarkSummary }>('adminRunBenchmarks'),
  adminResolveFeedback: callable<In<typeof AdminResolveFeedbackSchema>, { ok: true }>('adminResolveFeedback'),
};

const FRIENDLY: Record<string, string> = {
  'functions/unauthenticated': 'Your session has expired. Please sign in again.',
  'functions/permission-denied': 'You do not have permission to do this.',
  'functions/resource-exhausted': 'Too many requests. Please wait a moment and try again.',
  'functions/unavailable': 'The service is temporarily unavailable. Please try again.',
  'functions/deadline-exceeded': 'The request took too long. Please try again.',
  'functions/internal': 'Something went wrong on our side. Please try again.',
  'functions/not-found': 'The requested item could not be found.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for this project.',
  'permission-denied': 'You do not have access to this information.',
};

/** Convert any error into a message that is safe and useful to show users (never a stack trace). */
export function friendlyError(error: unknown): string {
  if (error instanceof FirebaseError) {
    // Validation and precondition messages from our functions are written for users.
    if (error.code === 'functions/invalid-argument' || error.code === 'functions/failed-precondition') return error.message;
    return FRIENDLY[error.code] ?? FRIENDLY[error.code.replace(/^firestore\//, '')] ?? 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

export function downloadBase64(fileName: string, mimeType: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
