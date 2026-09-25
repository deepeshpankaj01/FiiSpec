/**
 * Deployment parameters. Secrets are stored in Cloud Secret Manager
 * (`firebase functions:secrets:set ANTHROPIC_API_KEY`) and never reach the client.
 */
import { defineSecret, defineString } from 'firebase-functions/params';

export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

/** Claude model used by the AI stages. */
export const AI_MODEL = defineString('AI_MODEL', { default: 'claude-opus-5' });

/**
 * Set ENFORCE_APP_CHECK=true in functions/.env.<projectId> once App Check is
 * configured for the web app. Read at load time because callable options are
 * fixed when functions are defined.
 */
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

export const FUNCTIONS_REGION = 'asia-south1';

export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
