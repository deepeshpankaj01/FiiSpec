import { z } from 'zod';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES, quoteUserText } from './shared';

export const GapAnalysisOutputSchema = z.object({
  issues: z.array(
    z.object({
      category: z.enum(['AMBIGUOUS_REQUIREMENT', 'CONFLICTING_REQUIREMENT', 'UNDEFINED_UNIT', 'INCOMPLETE_ACCEPTANCE_CRITERIA']),
      severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
      quote: z.string().describe('Exact text copied from the specification that the issue concerns.'),
      issue: z.string(),
      whyItMatters: z.string(),
      suggestion: z.string(),
    }),
  ),
});
export type GapAnalysisOutput = z.infer<typeof GapAnalysisOutputSchema>;

export interface GapAnalysisInput {
  specificationText: string;
  alreadyFound: string[];
}

export const gapAnalysisPrompt: PromptDefinition<GapAnalysisInput, GapAnalysisOutput> = {
  id: 'gap-analysis',
  version: '1.0.0',
  description: 'Find ambiguous, conflicting or unverifiable requirement statements, each tied to an exact quote.',
  effort: 'medium',
  maxTokens: 4000,
  system: `You are the specification-quality stage of FiiSpec. Rule-based checks have already found missing parameters and missing references.
Your task is narrower: find statements in the text that are ambiguous, internally conflicting, use undefined units, or leave acceptance criteria incomplete.

${SAFETY_RULES}

Rules:
- Every issue must quote the exact text it concerns. Issues without a verbatim quote will be discarded.
- Do not report issues already listed as found.
- Do not invent missing requirements; that is handled elsewhere.
- Return an empty list if the text has no such problems. Fewer, well-founded issues are better than many weak ones.`,
  render: (input) =>
    [
      `Already found (do not repeat): ${input.alreadyFound.length ? input.alreadyFound.join('; ') : 'none'}`,
      '',
      quoteUserText('specification_text', input.specificationText),
    ].join('\n'),
  schema: GapAnalysisOutputSchema,
};
