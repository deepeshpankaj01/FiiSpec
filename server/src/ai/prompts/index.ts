import { certificationClassificationPrompt } from './certificationClassification';
import { gapAnalysisPrompt } from './gapAnalysis';
import { relationshipExplanationPrompt } from './relationshipExplanation';
import { specDraftingPrompt } from './specDrafting';
import { specExtractionPrompt } from './specExtraction';
import { standardRelevancePrompt } from './standardRelevance';
import { versionReasoningPrompt } from './versionReasoning';

export {
  certificationClassificationPrompt,
  gapAnalysisPrompt,
  relationshipExplanationPrompt,
  specDraftingPrompt,
  specExtractionPrompt,
  standardRelevancePrompt,
  versionReasoningPrompt,
};

/** Registry used to publish prompt metadata to systemConfig/prompts and to the admin health page. */
export const PROMPT_REGISTRY = [
  specExtractionPrompt,
  standardRelevancePrompt,
  relationshipExplanationPrompt,
  versionReasoningPrompt,
  certificationClassificationPrompt,
  gapAnalysisPrompt,
  specDraftingPrompt,
].map((p) => ({ id: p.id, version: p.version, description: p.description, effort: p.effort }));
