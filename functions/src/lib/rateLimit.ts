import { HttpsError } from 'firebase-functions/https';
import { db } from './admin';

export const RATE_LIMITS = {
  createAnalysis: { limit: 30, windowSeconds: 3600 },
  generateSpecification: { limit: 30, windowSeconds: 3600 },
  exportReport: { limit: 60, windowSeconds: 3600 },
  searchStandards: { limit: 600, windowSeconds: 3600 },
  joinOrganization: { limit: 10, windowSeconds: 3600 },
  submitFeedback: { limit: 100, windowSeconds: 3600 },
  runBenchmarks: { limit: 10, windowSeconds: 3600 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/** Pure window computation, unit-tested. */
export function nextWindowState(
  current: { windowStart: number; count: number } | undefined,
  nowMs: number,
  limit: number,
  windowSeconds: number,
): { allowed: boolean; state: { windowStart: number; count: number } } {
  const windowMs = windowSeconds * 1000;
  if (!current || nowMs - current.windowStart >= windowMs) return { allowed: true, state: { windowStart: nowMs, count: 1 } };
  if (current.count >= limit) return { allowed: false, state: current };
  return { allowed: true, state: { windowStart: current.windowStart, count: current.count + 1 } };
}

/** Fixed-window per-user rate limit stored in rateLimits/{uid}_{action} (server-only collection). */
export async function enforceRateLimit(uid: string, action: RateLimitedAction): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  const ref = db.collection('rateLimits').doc(`${uid}_${action}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { windowStart: number; count: number }) : undefined;
    const next = nextWindowState(data, Date.now(), limit, windowSeconds);
    if (next.allowed) tx.set(ref, next.state);
    return next.allowed;
  });
  if (!allowed) throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a while and try again.');
}
