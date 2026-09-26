/**
 * Minimal runtime for FiiSpec's server API, replacing firebase-functions so the
 * same handlers run inside Next.js route handlers on Vercel. Handlers keep the
 * callable shape (`request.auth`, `request.data`) and throw HttpsError; the
 * HTTP layer (see ../http/callable.ts) maps both to the callable protocol.
 */

export type FunctionsErrorCode =
  | 'cancelled'
  | 'unknown'
  | 'invalid-argument'
  | 'deadline-exceeded'
  | 'not-found'
  | 'already-exists'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'aborted'
  | 'out-of-range'
  | 'unimplemented'
  | 'internal'
  | 'unavailable'
  | 'data-loss'
  | 'unauthenticated';

const HTTP_STATUS: Record<FunctionsErrorCode, number> = {
  cancelled: 499,
  unknown: 500,
  'invalid-argument': 400,
  'deadline-exceeded': 504,
  'not-found': 404,
  'already-exists': 409,
  'permission-denied': 403,
  'resource-exhausted': 429,
  'failed-precondition': 400,
  aborted: 409,
  'out-of-range': 400,
  unimplemented: 501,
  internal: 500,
  unavailable: 503,
  'data-loss': 500,
  unauthenticated: 401,
};

/** An error whose message is safe to show to the caller. */
export class HttpsError extends Error {
  constructor(
    readonly code: FunctionsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpsError';
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

/** Verified Firebase ID token claims (standard claims plus FiiSpec custom claims). */
export type AuthToken = Record<string, unknown> & { uid: string; email?: string; name?: string };

export interface CallableRequest<T = unknown> {
  data: T;
  auth?: { uid: string; token: AuthToken };
}

export type Callable<Res = unknown> = (request: CallableRequest<unknown>) => Promise<Res>;

/** Declares a callable handler. Registered by name in ../index.ts. */
export function onCall<Res>(handler: Callable<Res>): Callable<Res> {
  return handler;
}

type BackgroundScheduler = (task: () => Promise<void>) => void;

// Default: run detached. The Next.js route handlers install `after` so the
// platform keeps the function alive until the task finishes.
let scheduler: BackgroundScheduler = (task) => {
  void task();
};

export function setBackgroundScheduler(next: BackgroundScheduler): void {
  scheduler = next;
}

/** Run work after the response is sent (e.g. the analysis pipeline). The task must handle its own errors. */
export function runInBackground(task: () => Promise<void>): void {
  scheduler(task);
}
