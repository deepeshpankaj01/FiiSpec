import { db } from '../lib/admin';
import { aiModel, anthropicApiKey } from '../lib/config';
import { log } from '../lib/log';
import { AnthropicAiClient } from './anthropic';
import type { AiClient } from './types';

interface AiConfigDoc {
  enabled?: boolean;
  model?: string;
}

/**
 * Returns an AI client, or null when AI is disabled or no key is configured.
 * `systemConfig/ai` allows administrators to disable AI or change model
 * without a redeploy (remote configuration).
 */
export async function getAiClient(): Promise<AiClient | null> {
  const apiKey = anthropicApiKey();
  if (!apiKey || apiKey === 'not-configured') return null;

  let remote: AiConfigDoc = {};
  try {
    const snap = await db.collection('systemConfig').doc('ai').get();
    remote = (snap.data() as AiConfigDoc | undefined) ?? {};
  } catch (error) {
    log.warn('ai.config_read_failed', { reason: error instanceof Error ? error.message : 'unknown' });
  }
  if (remote.enabled === false) return null;
  const model = remote.model?.trim() || aiModel();
  return new AnthropicAiClient(apiKey, model);
}
