import { z } from 'zod';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES } from './shared';

export const RelationshipExplanationOutputSchema = z.object({
  explanations: z.array(
    z.object({
      edgeId: z.string(),
      explanation: z.string().describe('One sentence on why this connection matters for this specific procurement.'),
    }),
  ),
});
export type RelationshipExplanationOutput = z.infer<typeof RelationshipExplanationOutputSchema>;

export interface RelationshipExplanationInput {
  productSummary: string;
  edges: { edgeId: string; from: string; to: string; toTitle: string; type: string; provenance: string }[];
}

export const relationshipExplanationPrompt: PromptDefinition<RelationshipExplanationInput, RelationshipExplanationOutput> = {
  id: 'relationship-explanation',
  version: '1.0.0',
  description: 'Explain, in procurement terms, why each curated relationship matters for this product.',
  effort: 'low',
  maxTokens: 4000,
  system: `You are the relationship-explanation stage of FiiSpec. Each relationship between standards was curated with a recorded provenance.
Write a short, practical explanation of why each relationship matters for the procurement described.

${SAFETY_RULES}

Rules:
- Do not change, add or dispute relationships. Explain only the edges listed, using the edge ids given.
- Do not claim what clauses a standard contains beyond the provenance statement provided.
- Write for a procurement officer: plain language, one sentence, no marketing tone.`,
  render: (input) =>
    [
      `Procurement: ${input.productSummary}`,
      '',
      'Relationships:',
      ...input.edges.map((e) => `[${e.edgeId}] ${e.from} —${e.type}→ ${e.to} (${e.toTitle}). Provenance: ${e.provenance}`),
    ].join('\n'),
  schema: RelationshipExplanationOutputSchema,
};
