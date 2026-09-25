import { z } from 'zod';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES, quoteUserText } from './shared';

export const RelevanceOutputSchema = z.object({
  assessments: z.array(
    z.object({
      candidateId: z.string(),
      relevance: z.number().describe('0.0 = unrelated, 1.0 = the scope squarely covers this product and use.'),
      role: z.enum(['PRIMARY_PRODUCT', 'SUPPORTING', 'NOT_RELEVANT']),
      rationale: z.string().describe('One or two sentences grounded in the candidate scope text and the requirement.'),
    }),
  ),
});
export type RelevanceOutput = z.infer<typeof RelevanceOutputSchema>;

export interface RelevanceInput {
  requirementSummary: string;
  productName: string;
  categoryLabel: string | null;
  candidates: { candidateId: string; designation: string; title: string; scope: string }[];
}

export const standardRelevancePrompt: PromptDefinition<RelevanceInput, RelevanceOutput> = {
  id: 'standard-relevance',
  version: '1.0.0',
  description: 'Assess semantic relevance of retrieved candidate standards to the requirement.',
  effort: 'high',
  maxTokens: 6000,
  system: `You are the semantic relevance stage of FiiSpec. A deterministic retriever has already selected candidate Indian Standards from an indexed dataset.
For each candidate, judge how well its scope covers the product and its intended use.

${SAFETY_RULES}

Rules:
- Assess only the candidates listed, using only the ids given. Do not mention any other standard.
- PRIMARY_PRODUCT: the standard specifies the product (or system) being procured.
- SUPPORTING: the standard is useful context (component, test, installation) but does not specify the product itself.
- NOT_RELEVANT: the scope does not concern this product.
- Base the rationale on the scope text provided, not on outside knowledge of the standard's contents.`,
  render: (input) =>
    [
      `Product: ${input.productName}`,
      `Category: ${input.categoryLabel ?? 'not determined'}`,
      quoteUserText('requirement_summary', input.requirementSummary),
      '',
      'Candidates:',
      ...input.candidates.map((c) => `[${c.candidateId}] ${c.designation} — ${c.title}\nScope: ${c.scope}`),
    ].join('\n'),
  schema: RelevanceOutputSchema,
};
