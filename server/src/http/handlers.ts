/**
 * HTTP entry points (Web Request/Response, used by the Next.js route handlers).
 *
 * Callables follow the Firebase callable conventions: the body is
 * `{ data }`, the caller sends `Authorization: Bearer <Firebase ID token>`
 * (and `X-Firebase-AppCheck` when App Check is enforced), and the response is
 * `{ result }` or `{ error: { code, message } }` with a matching HTTP status.
 */
import { MAX_UPLOAD_BYTES } from '../../../shared/constants';
import { sweepStaleAnalyses } from '../analysis/retry';
import { acceptUploadedDocument } from '../documents/onUpload';
import { CALLABLES } from '../index';
import { adminAppCheck, adminAuth } from '../lib/admin';
import { callerFrom, requirePermission } from '../lib/auth';
import { ENFORCE_APP_CHECK } from '../lib/config';
import { log } from '../lib/log';
import { type AuthToken, type CallableRequest, HttpsError } from '../lib/runtime';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function errorResponse(error: unknown, context: Record<string, string>): Response {
  if (error instanceof HttpsError) return json({ error: { code: error.code, message: error.message } }, error.httpStatus);
  log.error('http.unhandled_error', error, context);
  return json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } }, 500);
}

/** Verify the caller's ID token (and App Check token when enforced). No token means an anonymous request. */
export async function authenticate(request: Request): Promise<CallableRequest['auth']> {
  if (ENFORCE_APP_CHECK) {
    const appCheckToken = request.headers.get('x-firebase-appcheck');
    if (!appCheckToken) throw new HttpsError('unauthenticated', 'App Check verification failed.');
    try {
      await adminAppCheck().verifyToken(appCheckToken);
    } catch {
      throw new HttpsError('unauthenticated', 'App Check verification failed.');
    }
  }
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]!);
    return { uid: decoded.uid, token: decoded as unknown as AuthToken };
  } catch {
    throw new HttpsError('unauthenticated', 'Your session has expired. Please sign in again.');
  }
}

export async function handleCallable(name: string, request: Request): Promise<Response> {
  try {
    if (!Object.hasOwn(CALLABLES, name)) throw new HttpsError('not-found', 'Unknown function.');
    const handler = CALLABLES[name as keyof typeof CALLABLES];
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpsError('invalid-argument', 'Request body must be JSON.');
    }
    const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : undefined;
    const auth = await authenticate(request);
    const result = await handler({ data, auth });
    return json({ result: result ?? null });
  } catch (error) {
    return errorResponse(error, { callable: name });
  }
}

/** PUT /api/analyses/{id}/document — raw PDF/DOCX body with its Content-Type. */
export async function handleDocumentUpload(analysisId: string, request: Request): Promise<Response> {
  try {
    const caller = requirePermission(callerFrom({ data: null, auth: await authenticate(request) }), 'createAnalysis');
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_UPLOAD_BYTES) throw new HttpsError('invalid-argument', 'The file is larger than the upload limit.');
    const contentType = (request.headers.get('content-type') ?? '').split(';')[0]!.trim();
    const buffer = Buffer.from(await request.arrayBuffer());
    await acceptUploadedDocument(caller, analysisId, { buffer, contentType });
    return json({ result: { ok: true } });
  } catch (error) {
    return errorResponse(error, { route: 'document-upload' });
  }
}

/** GET /api/cron/sweep — called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function handleSweepCron(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: { code: 'unauthenticated', message: 'Unauthorized.' } }, 401);
  try {
    return json({ result: await sweepStaleAnalyses() });
  } catch (error) {
    return errorResponse(error, { route: 'cron-sweep' });
  }
}
