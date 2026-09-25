import { z } from 'zod';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES } from './shared';

export const VersionReasoningOutputSchema = z.object({
  explanations: z.array(
    z.object({
      findingId: z.string(),
      explanation: z.string().describe('Plain-language consequence for the procurement and the recommended action.'),
    }),
  ),
});
export type VersionReasoningOutput = z.infer<typeof VersionReasoningOutputSchema>;

export interface VersionReasoningInput {
  findings: { findingId: string; citedAs: string | null; state: string; facts: string }[];
}

export const versionReasoningPrompt: PromptDefinition<VersionReasoningInput, VersionReasoningOutput> = {
  id: 'version-reasoning',
  version: '1.0.0',
  description: 'Explain the procurement consequence of each deterministic version finding.',
  effort: 'low',
  maxTokens: 3000,
  system: `You are the version-reasoning stage of FiiSpec. A deterministic checker has compared standard references against version records.
The state of each finding is already decided. Explain what it means for the tender and what the officer should do.

${SAFETY_RULES}

Rules:
- Never upgrade a finding: if the state says verification is required, do not say the version is current.
- Use only the facts listed for each finding.
- One or two sentences per finding.`,
  render: (input) =>
    ['Findings:', ...input.findings.map((f) => `[${f.findingId}] cited as "${f.citedAs ?? 'n/a'}" — state ${f.state}. Facts: ${f.facts}`)].join('\n'),
  schema: VersionReasoningOutputSchema,
};
