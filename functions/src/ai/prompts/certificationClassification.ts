import { z } from 'zod';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES, quoteUserText } from './shared';

export const CertificationAssessmentOutputSchema = z.object({
  assessments: z.array(
    z.object({
      ruleId: z.string(),
      conditionStatus: z.enum(['MET', 'NOT_MET', 'UNCLEAR']),
      supportingQuote: z.string().nullable().describe('Exact text from the requirement supporting the status, or null.'),
      reasoning: z.string(),
    }),
  ),
});
export type CertificationAssessmentOutput = z.infer<typeof CertificationAssessmentOutputSchema>;

export interface CertificationAssessmentInput {
  requirementText: string;
  rules: { ruleId: string; title: string; condition: string }[];
}

export const certificationClassificationPrompt: PromptDefinition<CertificationAssessmentInput, CertificationAssessmentOutput> = {
  id: 'certification-classification',
  version: '1.0.0',
  description: 'Assess whether the scope condition of each candidate certification rule appears to be met by the requirement.',
  effort: 'medium',
  maxTokens: 3000,
  system: `You are the certification-context stage of FiiSpec. Candidate certification rules were matched deterministically from an indexed rule set.
For each rule, judge only whether its stated scope condition appears to be met by the product described.

${SAFETY_RULES}

Rules:
- You do not decide whether certification is legally required. The system classifies; a human verifies against the current official notification.
- MET only when the requirement text clearly satisfies the condition. UNCLEAR when the text does not say enough.
- supportingQuote must be copied exactly from the requirement text, or null.`,
  render: (input) =>
    [
      quoteUserText('requirement_text', input.requirementText),
      '',
      'Candidate rules:',
      ...input.rules.map((r) => `[${r.ruleId}] ${r.title}\nCondition: ${r.condition}`),
    ].join('\n'),
  schema: CertificationAssessmentOutputSchema,
};
