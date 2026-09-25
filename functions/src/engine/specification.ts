/**
 * Stage 1 — Specification understanding.
 * Combines deterministic extraction (always) with validated AI extraction
 * (when available) into a StructuredSpecification.
 */
import type { ExtractedParameter, StructuredSpecification } from '../../../shared/analysis';
import type { ConfidenceLevel, SectorId } from '../../../shared/constants';
import { SECTORS } from '../../../shared/constants';
import type { ProductCategory } from '../../../shared/knowledge';
import type { SpecExtractionOutput } from '../ai/prompts/specExtraction';
import { detectCategory } from './category';
import { parseCitations } from './citations';
import { detectContext } from './entities';
import { detectLanguage } from './language';
import { extractParameters } from './parameters';
import { normalizeText, shortHash, truncate } from './text';

export interface SpecificationInput {
  text: string;
  productField: string | null;
  purposeField: string | null;
  procurementContextField: string | null;
  sectorHint: string | null;
}

function firstSentence(text: string): string {
  const sentence = normalizeText(text).split(/(?<=[.!?])\s|\n/)[0] ?? text;
  return truncate(sentence.trim(), 90);
}

/**
 * A concise product phrase from a short description, e.g.
 * "11 kW outdoor AC EV charger for public charging." -> "11 kW outdoor AC EV charger".
 * Returns null when no short, clean phrase can be derived (the category label is used instead).
 */
export function deriveProductPhrase(text: string): string | null {
  const first = normalizeText(text).split(/(?<=[.!?])\s|\n/)[0] ?? '';
  const phrase = first
    .replace(/^(supply(,? installation)?( and commissioning)? of|procurement of|purchase of|i need( an?)?|we need( an?)?|need( an?)?|required:?)\s+/i, '')
    .split(/\s+(?:for|conforming|as per|with|to be|which|that|in accordance)\s+/i)[0]!
    .replace(/[.,;:\s]+$/, '')
    .trim();
  if (phrase.length < 5 || phrase.length > 60) return null;
  if (/\bIS\s*\d|\bIEC\b/i.test(phrase)) return null;
  return phrase;
}

/** "11 kW outdoor AC EV charger for public charging." -> "public charging" */
export function extractIntendedUse(text: string): string | null {
  const m = /\b(?:for|intended for|to be used for|for use (?:in|at))\s+(?!the supply\b)([^.;:\n]{3,90})/i.exec(normalizeText(text));
  if (!m) return null;
  const phrase = m[1]!.trim().replace(/[,\s]+$/, '');
  // Discard phrases that are just quantities or standard citations.
  if (/^\d/.test(phrase) || /^(is|iec|iso)\s*\d/i.test(phrase)) return null;
  return phrase;
}

function sectorOf(value: string | null): SectorId | null {
  return value && (SECTORS as readonly string[]).includes(value) ? (value as SectorId) : null;
}

/** An AI-reported parameter is accepted only if its sourceText actually occurs in the input. */
function isGrounded(sourceText: string, inputLower: string): boolean {
  const needle = normalizeText(sourceText).toLowerCase();
  return needle.length >= 2 && inputLower.includes(needle);
}

function mergeAiParameters(deterministic: ExtractedParameter[], ai: SpecExtractionOutput['parameters'], inputLower: string): {
  parameters: ExtractedParameter[];
  rejected: number;
} {
  const merged = [...deterministic];
  const kinds = new Set(deterministic.map((p) => p.kind));
  let rejected = 0;
  for (const p of ai) {
    if (!isGrounded(p.sourceText, inputLower)) {
      rejected += 1;
      continue;
    }
    if (kinds.has(p.kind)) continue; // deterministic reading wins for the same kind
    kinds.add(p.kind);
    merged.push({
      id: `p-ai-${shortHash(`${p.kind}-${p.sourceText}`)}`,
      kind: p.kind,
      label: p.label,
      rawText: p.sourceText,
      value: p.value,
      valueMax: p.valueMax,
      unit: p.unit,
      normalizedValue: p.value,
      normalizedValueMax: p.valueMax,
      normalizedUnit: p.unit,
      textValue: p.textValue,
      confidence: 'MEDIUM',
      origin: 'AI',
      note: 'Interpreted by AI from the quoted text',
    });
  }
  return { parameters: merged, rejected };
}

export interface SpecificationBuildResult {
  specification: StructuredSpecification;
  warnings: string[];
}

export function buildSpecification(
  input: SpecificationInput,
  categories: ProductCategory[],
  ai: SpecExtractionOutput | null,
): SpecificationBuildResult {
  const warnings: string[] = [];
  const text = normalizeText(input.text);
  const inputLower = text.toLowerCase();
  const language = detectLanguage(text);

  // Deterministic understanding operates on the original text plus the AI's faithful English restatement.
  const aiSummary = ai?.normalizedSummaryEnglish?.trim() || null;
  const analysisText = aiSummary && language.detected !== 'en' ? `${text}\n${aiSummary}` : text;

  const context = detectContext(analysisText);
  const deterministicParams = extractParameters(text);
  const citations = parseCitations(text);

  const productText = input.productField?.trim() || null;
  const detection = detectCategory(analysisText, productText, categories, input.sectorHint);

  // Category: accept the AI's choice only if it is a real taxonomy id; reconcile with deterministic detection.
  let categoryId = detection.categoryId;
  let categoryConfidence: ConfidenceLevel = detection.confidence;
  const categoryEvidence = [...detection.evidence];
  const validIds = new Set(categories.map((c) => c.id));
  if (ai?.productCategoryId && !validIds.has(ai.productCategoryId)) {
    warnings.push('AI proposed a product category outside the taxonomy; it was ignored.');
  } else if (ai?.productCategoryId) {
    if (!categoryId) {
      categoryId = ai.productCategoryId;
      categoryConfidence = 'MEDIUM';
      categoryEvidence.push(`AI interpretation: ${ai.categoryReason}`);
    } else if (ai.productCategoryId === categoryId) {
      categoryConfidence = categoryConfidence === 'LOW' || categoryConfidence === 'REVIEW_REQUIRED' ? 'MEDIUM' : 'HIGH';
      categoryEvidence.push('AI interpretation agrees with the matched product terms.');
    } else {
      const aiCategory = categories.find((c) => c.id === ai.productCategoryId);
      const detCategory = categories.find((c) => c.id === categoryId);
      const related = aiCategory?.parentId === categoryId || detCategory?.parentId === ai.productCategoryId;
      if (related) {
        categoryEvidence.push(`AI interpretation points to the related category "${aiCategory?.label}".`);
      } else {
        categoryConfidence = 'REVIEW_REQUIRED';
        categoryEvidence.push(`AI interpretation ("${aiCategory?.label}") disagrees with matched product terms — review required.`);
      }
    }
  } else if (ai && ai.productCategoryId === null && categoryId) {
    categoryEvidence.push('AI could not assign a category; the deterministic match is used.');
    if (categoryConfidence === 'HIGH') categoryConfidence = 'MEDIUM';
  }

  if (language.detected !== 'en') {
    if (aiSummary) {
      language.normalization = 'AI_NORMALIZED';
    } else {
      language.normalization = 'UNAVAILABLE';
      warnings.push('The input is not in English and AI normalisation was unavailable; understanding is limited to numbers, units and English technical terms.');
      if (categoryConfidence === 'HIGH') categoryConfidence = 'MEDIUM';
    }
  }

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const { parameters, rejected } = ai
    ? mergeAiParameters(deterministicParams, ai.parameters, inputLower)
    : { parameters: deterministicParams, rejected: 0 };
  if (rejected > 0) warnings.push(`${rejected} AI-reported parameter(s) were discarded because their source text was not found in the input.`);

  const environment = ai && ai.environmentSetting !== 'UNSPECIFIED' && context.environment.setting === 'UNSPECIFIED'
    ? { setting: ai.environmentSetting, conditions: ai.environmentConditions }
    : context.environment;

  const productName =
    productText || ai?.productName?.trim() || (language.detected === 'en' ? deriveProductPhrase(text) : null) || (category ? category.label : firstSentence(text));
  const intendedUse = input.purposeField?.trim() || ai?.intendedUse || extractIntendedUse(text);

  const missingFields: string[] = [];
  if (!intendedUse) missingFields.push('Intended use / application');
  if (environment.setting === 'UNSPECIFIED') missingFields.push('Installation environment (indoor / outdoor)');
  if (!parameters.some((p) => p.kind === 'QUANTITY')) missingFields.push('Quantity to be procured');
  for (const item of ai?.missingInformation ?? []) {
    if (!missingFields.includes(item)) missingFields.push(item);
  }

  const uncertainFields = [...(ai?.uncertainFields ?? [])];
  if (categoryConfidence === 'LOW' || categoryConfidence === 'REVIEW_REQUIRED') uncertainFields.push('Product category');

  const specification: StructuredSpecification = {
    productName,
    productCategoryId: categoryId,
    productCategoryLabel: category?.label ?? null,
    categoryConfidence,
    categoryAlternatives: detection.alternatives.map((a) => ({ id: a.id, label: a.label })),
    categoryEvidence,
    intendedUse,
    industry: sectorOf(input.sectorHint) ?? category?.sector ?? null,
    technicalParameters: parameters,
    materials: [...new Set([...context.materials, ...(ai?.materials ?? []).map((m) => m.toLowerCase())])],
    environment,
    capacity: ai?.capacity ?? null,
    safetyRequirements: [...new Set([...context.safetyMentions, ...(ai?.safetyRequirements ?? [])])],
    installationContext: ai?.installationContext ?? (context.installationMentions.length ? context.installationMentions.join(', ') : null),
    procurementContext: input.procurementContextField?.trim() || ai?.procurementContext || null,
    referencedStandards: citations,
    certificationMentions: context.certificationMentions,
    testingMentions: context.testingMentions,
    acceptanceMentions: context.acceptanceMentions,
    extractedEntities: [
      ...(category ? [{ type: 'PRODUCT' as const, text: category.label }] : []),
      ...context.materials.map((m) => ({ type: 'MATERIAL' as const, text: m })),
      ...context.environment.conditions.map((c) => ({ type: 'ENVIRONMENT' as const, text: c })),
      ...context.certificationMentions.map((c) => ({ type: 'CERTIFICATION' as const, text: c })),
      ...citations.map((c) => ({ type: 'STANDARD' as const, text: c.citedAs })),
    ],
    missingFields,
    uncertainFields,
    language,
    normalizedSummary: aiSummary ?? truncate(text, 600),
    origin: ai ? 'AI_ASSISTED' : 'DETERMINISTIC',
  };
  return { specification, warnings };
}

/** The text that retrieval and gap analysis operate on (original + AI English restatement when non-English). */
export function analysisTextFor(spec: StructuredSpecification, originalText: string): string {
  return spec.language.detected !== 'en' && spec.language.normalization === 'AI_NORMALIZED'
    ? `${originalText}\n${spec.normalizedSummary}`
    : originalText;
}

export function categoryById(categories: ProductCategory[], id: string | null): ProductCategory | null {
  return id ? categories.find((c) => c.id === id) ?? null : null;
}
