/**
 * Deployment parameters, read from server-side environment variables
 * (Vercel project settings in production, .env.local in development).
 * None of these are NEXT_PUBLIC_, so they never reach the client bundle.
 */

/** Anthropic API key. Unset or `not-configured` runs FiiSpec in deterministic-only mode. */
export const anthropicApiKey = (): string => process.env.ANTHROPIC_API_KEY?.trim() ?? '';

/** Claude model used by the AI stages (administrators can override it in systemConfig/ai). */
export const aiModel = (): string => process.env.AI_MODEL?.trim() || 'claude-opus-5';

/** Set ENFORCE_APP_CHECK=true once App Check (reCAPTCHA Enterprise) is configured for the web app. */
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * Wall-clock budget for one analysis run. Vercel stops a function at its
 * maxDuration (300 s on Hobby), so the pipeline gives up first and records a
 * PROCESSING_TIMEOUT instead of leaving the analysis stuck.
 */
export const PIPELINE_DEADLINE_MS = Number(process.env.PIPELINE_DEADLINE_MS) || 250_000;

/** True when the Admin SDK talks to the local Emulator Suite. */
export const IS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
