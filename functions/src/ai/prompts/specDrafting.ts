import { z } from 'zod';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES } from './shared';

export const SpecDraftingOutputSchema = z.object({
  productDefinition: z.string().describe('2–4 sentences defining the item being procured.'),
  technicalRequirements: z.array(z.string()).describe('One clear, verifiable requirement per entry.'),
});
export type SpecDraftingOutput = z.infer<typeof SpecDraftingOutputSchema>;

export interface SpecDraftingInput {
  productName: string;
  requirementSummary: string;
  parameters: string[];
  allowedStandards: string[];
  openGaps: string[];
}

export const specDraftingPrompt: PromptDefinition<SpecDraftingInput, SpecDraftingOutput> = {
  id: 'spec-drafting',
  version: '1.0.0',
  description: 'Draft product-definition and technical-requirement prose from verified blueprint facts.',
  effort: 'medium',
  maxTokens: 4000,
  system: `You are the drafting stage of FiiSpec. You write the product definition and technical requirements sections of a procurement specification draft.
The draft will be reviewed by a human before use. It is not official government text.

${SAFETY_RULES}

Rules:
- Use only the parameters and standards provided. You may only cite standards from the allowed list, written exactly as given.
- Where a parameter needed for a verifiable requirement is missing (see open gaps), write "[To be specified by purchaser: …]" instead of inventing a value.
- Each technical requirement must be measurable or verifiable at acceptance.
- Formal procurement register, no marketing language.`,
  render: (input) =>
    [
      `Product: ${input.productName}`,
      `Requirement summary: ${input.requirementSummary}`,
      `Stated parameters: ${input.parameters.length ? input.parameters.join('; ') : 'none stated'}`,
      `Allowed standards: ${input.allowedStandards.length ? input.allowedStandards.join('; ') : 'none'}`,
      `Open gaps: ${input.openGaps.length ? input.openGaps.join('; ') : 'none'}`,
    ].join('\n'),
  schema: SpecDraftingOutputSchema,
};
