/**
 * Claude implementation of the AiClient interface.
 * Uses structured outputs (Zod schema -> JSON schema) so downstream code never
 * parses free-form text. Output is additionally re-validated with Zod.
 * The SDK is loaded lazily to keep function cold starts fast.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiClient, AiResult, PromptDefinition } from './types';

export const DEFAULT_MODEL = 'claude-opus-5';

type Sdk = { Anthropic: typeof Anthropic; betaZodOutputFormat: typeof import('@anthropic-ai/sdk/helpers/beta/zod').betaZodOutputFormat };
let sdk: Promise<Sdk> | null = null;
function loadSdk(): Promise<Sdk> {
  sdk ??= Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')]).then(([core, zod]) => ({ Anthropic: core.default, betaZodOutputFormat: zod.betaZodOutputFormat }));
  return sdk;
}

export class AnthropicAiClient implements AiClient {
  private client: Anthropic | null = null;

  constructor(
    private readonly apiKey: string,
    readonly model: string = DEFAULT_MODEL,
  ) {}

  async generate<TInput, TOutput>(prompt: PromptDefinition<TInput, TOutput>, input: TInput): Promise<AiResult<TOutput>> {
    const started = Date.now();
    const fail = (error: string): AiResult<TOutput> => ({ ok: false, error, latencyMs: Date.now() - started, model: this.model });
    const { Anthropic: AnthropicSdk, betaZodOutputFormat } = await loadSdk();
    this.client ??= new AnthropicSdk({ apiKey: this.apiKey, timeout: 120_000, maxRetries: 2 });
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: prompt.maxTokens,
        // Server-side refusal fallback: re-runs a declined request on a fallback model within the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.render(input) }],
        output_config: { effort: prompt.effort, format: betaZodOutputFormat(prompt.schema) },
      });

      if (response.stop_reason === 'refusal') return fail('Model declined the request');
      if (response.stop_reason === 'max_tokens') return fail('Model output was truncated');
      if (response.parsed_output === null || response.parsed_output === undefined) return fail('Model output did not match schema');

      // Defence in depth: validate again with the canonical schema.
      const validated = prompt.schema.safeParse(response.parsed_output);
      if (!validated.success) return fail('Model output failed schema validation');
      return { ok: true, data: validated.data, latencyMs: Date.now() - started, model: this.model };
    } catch (error) {
      if (error instanceof AnthropicSdk.AuthenticationError) return fail('AI service authentication failed');
      if (error instanceof AnthropicSdk.RateLimitError) return fail('AI service rate limited');
      if (error instanceof AnthropicSdk.BadRequestError) return fail(`AI request rejected: ${error.message.slice(0, 160)}`);
      if (error instanceof AnthropicSdk.APIConnectionError) return fail('AI service unreachable');
      if (error instanceof AnthropicSdk.APIError) return fail(`AI service error ${error.status ?? ''}`.trim());
      return fail('Unexpected AI client error');
    }
  }
}
