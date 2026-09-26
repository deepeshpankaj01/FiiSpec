import { z } from 'zod';
import { QUANTITY_KINDS } from '../../../../shared/constants';
import type { PromptDefinition } from '../types';
import { SAFETY_RULES, quoteUserText } from './shared';

export const SpecExtractionOutputSchema = z.object({
  detectedLanguage: z.enum(['en', 'hi', 'hi-Latn', 'mixed', 'other']),
  normalizedSummaryEnglish: z.string().describe('Faithful English restatement of the requirement. No new facts.'),
  productName: z.string(),
  productCategoryId: z.string().nullable().describe('One id from the provided category list, or null if none fits.'),
  categoryReason: z.string(),
  intendedUse: z.string().nullable(),
  environmentSetting: z.enum(['INDOOR', 'OUTDOOR', 'INDOOR_OUTDOOR', 'UNSPECIFIED']),
  environmentConditions: z.array(z.string()),
  materials: z.array(z.string()),
  capacity: z.string().nullable(),
  installationContext: z.string().nullable(),
  procurementContext: z.string().nullable(),
  safetyRequirements: z.array(z.string()),
  parameters: z.array(
    z.object({
      kind: z.enum(QUANTITY_KINDS),
      label: z.string(),
      value: z.number().nullable(),
      valueMax: z.number().nullable(),
      unit: z.string().nullable(),
      textValue: z.string().nullable(),
      sourceText: z.string().describe('The exact characters from the input this parameter was read from.'),
    }),
  ),
  missingInformation: z.array(z.string()),
  uncertainFields: z.array(z.string()),
});
export type SpecExtractionOutput = z.infer<typeof SpecExtractionOutputSchema>;

export interface SpecExtractionInput {
  text: string;
  productHint: string | null;
  categories: { id: string; label: string; description: string }[];
}

export const specExtractionPrompt: PromptDefinition<SpecExtractionInput, SpecExtractionOutput> = {
  id: 'spec-extraction',
  version: '1.0.0',
  description: 'Normalise a procurement requirement (any language) into a structured English specification.',
  effort: 'medium',
  maxTokens: 8000,
  system: `You are the specification-understanding stage of FiiSpec, a decision-support system for Indian public procurement.
Your job is to read a product description, technical specification or tender extract — written in English, Hindi, Hinglish or a mix — and produce a faithful structured representation in English.

${SAFETY_RULES}

Extraction rules:
- Do not add requirements that are not in the text. The English summary must be a faithful restatement, not an improvement.
- Choose productCategoryId only from the provided list. If none fits, return null and explain in categoryReason.
- For every parameter, sourceText must be copied exactly from the input (in its original language/script).
- Use SI-style units (kW, V, A, Hz, °C, m, m³/h, kPa). Keep textValue for non-numeric parameters (e.g. "Type 2", "IP55", "OCPP 1.6J").
- Do not extract standard numbers as parameters; standard citations are parsed separately.
- List important information that a procurement officer would expect but is absent in missingInformation.`,
  render: (input) =>
    [
      'Available product categories (id — label: description):',
      ...input.categories.map((c) => `- ${c.id} — ${c.label}: ${c.description}`),
      '',
      input.productHint ? `Product field supplied by the user: ${input.productHint}` : 'No separate product field was supplied.',
      '',
      quoteUserText('procurement_text', input.text),
    ].join('\n'),
  schema: SpecExtractionOutputSchema,
};
