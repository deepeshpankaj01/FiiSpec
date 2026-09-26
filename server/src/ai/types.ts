/**
 * AI provider abstraction. The pipeline never depends on a specific vendor
 * and never throws on AI failure: every call returns a result object and the
 * caller falls back to deterministic logic.
 */
import type { z } from 'zod';

export type PromptId =
  | 'spec-extraction'
  | 'standard-relevance'
  | 'relationship-explanation'
  | 'version-reasoning'
  | 'certification-classification'
  | 'gap-analysis'
  | 'spec-drafting';

export interface PromptDefinition<TInput, TOutput> {
  id: PromptId;
  /** Semantic version recorded in every analysis trace. Bump on any wording change. */
  version: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  system: string;
  render: (input: TInput) => string;
  schema: z.ZodType<TOutput>;
}

export type AiResult<T> =
  | { ok: true; data: T; latencyMs: number; model: string }
  | { ok: false; error: string; latencyMs: number; model: string };

export interface AiClient {
  readonly model: string;
  generate<TInput, TOutput>(prompt: PromptDefinition<TInput, TOutput>, input: TInput): Promise<AiResult<TOutput>>;
}

export interface AiCallRecord {
  promptId: string;
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

/** Wraps a client to record every call for the pipeline trace and metrics. */
export class RecordingAiClient implements AiClient {
  readonly calls: AiCallRecord[] = [];
  readonly promptVersions: Record<string, string> = {};

  constructor(private readonly inner: AiClient) {}

  get model(): string {
    return this.inner.model;
  }

  async generate<TInput, TOutput>(prompt: PromptDefinition<TInput, TOutput>, input: TInput): Promise<AiResult<TOutput>> {
    this.promptVersions[prompt.id] = prompt.version;
    const result = await this.inner.generate(prompt, input);
    this.calls.push({ promptId: prompt.id, ok: result.ok, latencyMs: result.latencyMs, error: result.ok ? null : result.error });
    return result;
  }
}
