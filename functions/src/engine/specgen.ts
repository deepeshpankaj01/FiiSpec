/**
 * Procurement specification generation.
 *
 * The draft is assembled deterministically from the analysis blueprint. AI
 * may rewrite only the product-definition and technical-requirement prose,
 * and its text is rejected if it cites any standard outside the allowed set
 * or drops a purchaser placeholder.
 */
import type {
  AnalysisResultDoc,
  SpecItem,
  SpecSection,
  SpecSectionKey,
  SpecificationGap,
  StandardRecommendation,
} from '../../../shared/analysis';
import { SPEC_SECTION_KEYS, SPEC_SECTION_TITLES } from '../../../shared/analysis';
import { RELATIONSHIP_LABELS } from '../../../shared/constants';
import type { SpecDraftingOutput } from '../ai/prompts/specDrafting';
import { parseCitations } from './citations';
import { formatParameter } from './parameters';

const item = (text: string, origin: SpecItem['origin'], standardIds: string[] = []): SpecItem => ({ text, origin, standardIds });

function usable(r: StandardRecommendation): boolean {
  return !r.reviewRequired && r.confidence !== 'REVIEW_REQUIRED';
}

export interface DraftInput {
  result: AnalysisResultDoc;
  gaps: SpecificationGap[];
}

export function buildDeterministicDraft({ result, gaps }: DraftInput): SpecSection[] {
  const spec = result.specification;
  const recs = result.recommendations;
  const primary = recs.filter((r) => r.tier === 'PRIMARY');
  const related = recs.filter((r) => r.tier === 'RELATED' && usable(r));
  const openGaps = gaps.filter((g) => g.status === 'OPEN' || g.status === 'ACCEPTED');
  const byType = (type: string) => related.filter((r) => r.relationship?.type === type);
  const sections = new Map<SpecSectionKey, SpecItem[]>(SPEC_SECTION_KEYS.map((k) => [k, []]));
  const push = (key: SpecSectionKey, ...items: SpecItem[]) => sections.get(key)!.push(...items);

  // 1. Product definition
  const quantity = spec.technicalParameters.find((p) => p.kind === 'QUANTITY');
  const use = spec.intendedUse?.replace(/^for\s+/i, '').replace(/[.\s]+$/, '');
  push(
    'product_definition',
    item(`Supply of ${spec.productName}${use ? ` for ${use}` : ''}${quantity ? ` — quantity: ${formatParameter(quantity)}` : ''}.`, 'SPECIFICATION_INPUT'),
  );
  if (spec.productCategoryLabel) push('product_definition', item(`Product category: ${spec.productCategoryLabel}.`, 'KNOWLEDGE_BASE'));
  if (spec.environment.setting !== 'UNSPECIFIED') {
    const settingWords = /^(outdoor|outdoors|indoor|indoors)$/i;
    const conditions = [...new Set(spec.environment.conditions.filter((c) => !settingWords.test(c)))];
    push('product_definition', item(`Installation environment: ${spec.environment.setting.toLowerCase().replace('_', ' / ')}${conditions.length ? ` (${conditions.join(', ')})` : ''}.`, 'SPECIFICATION_INPUT'));
  }
  if (spec.procurementContext) push('product_definition', item(`Procurement context: ${spec.procurementContext}`, 'SPECIFICATION_INPUT'));
  if (!quantity) push('product_definition', item('[To be specified by purchaser: quantity and delivery schedule]', 'GAP_PLACEHOLDER'));

  // 2. Technical requirements
  for (const p of spec.technicalParameters.filter((x) => x.kind !== 'QUANTITY')) {
    push('technical_requirements', item(`${p.label}: ${formatParameter(p)}${p.origin === 'AI' ? ' (interpreted from input — confirm)' : ''}.`, 'SPECIFICATION_INPUT'));
  }
  for (const g of openGaps.filter((x) => x.category === 'MISSING_PARAMETER')) {
    push('technical_requirements', item(`[To be specified by purchaser: ${g.issue.replace(/: not specified\.$/, '')}] — ${g.suggestion}`, 'GAP_PLACEHOLDER', g.relatedStandardIds));
  }
  for (const g of openGaps.filter((x) => x.category === 'CONFLICTING_REQUIREMENT' || x.category === 'UNDEFINED_UNIT' || x.category === 'AMBIGUOUS_REQUIREMENT')) {
    push('technical_requirements', item(`[Resolve before publication: ${g.issue}] ${g.suggestion}`, 'GAP_PLACEHOLDER'));
  }

  // 3. Applicable Indian Standards
  for (const r of primary) {
    if (usable(r)) {
      push(
        'applicable_standards',
        item(
          `The ${spec.productName} shall conform to ${r.standardNumber} — ${r.title}, latest edition including all amendments. (Edition and amendment status to be verified against the BIS catalogue at the time of tender.)`,
          'KNOWLEDGE_BASE',
          [r.standardId],
        ),
      );
    } else {
      push('applicable_standards', item(`[Requires technical review before citing: ${r.standardNumber} — ${r.title}]`, 'GAP_PLACEHOLDER', [r.standardId]));
    }
  }
  if (!primary.length) push('applicable_standards', item('[No product standard could be established with sufficient evidence — technical review required]', 'GAP_PLACEHOLDER'));

  // 4. Related standards
  for (const r of [...byType('NORMATIVE_REFERENCE'), ...byType('RELATED_PRODUCT'), ...byType('RELATED_STANDARD'), ...byType('TERMINOLOGY')]) {
    push('related_standards', item(`${r.standardNumber} — ${r.title} (${RELATIONSHIP_LABELS[r.relationship!.type].toLowerCase()} of ${r.relationship!.fromDesignation}).`, 'KNOWLEDGE_BASE', [r.standardId]));
  }

  // 5. Testing
  for (const r of byType('TEST_METHOD')) {
    push('testing_requirements', item(`Tests shall be carried out as per ${r.standardNumber} — ${r.title}.`, 'KNOWLEDGE_BASE', [r.standardId]));
  }
  push(
    'testing_requirements',
    item('Type-test reports for the offered model, issued by an accredited laboratory, shall be submitted with the bid.', 'DRAFTING_TEMPLATE'),
    item('Routine tests shall be performed on every unit and routine test certificates supplied with delivery.', 'DRAFTING_TEMPLATE'),
  );

  // 6. Safety
  for (const r of byType('SAFETY')) {
    push('safety_requirements', item(`The equipment shall meet the safety requirements of ${r.standardNumber} — ${r.title}.`, 'KNOWLEDGE_BASE', [r.standardId]));
  }
  for (const s of spec.safetyRequirements.slice(0, 8)) push('safety_requirements', item(`Stated requirement: ${s}.`, 'SPECIFICATION_INPUT'));
  if (openGaps.some((g) => g.category === 'MISSING_SAFETY_REQUIREMENT')) {
    push('safety_requirements', item('[To be specified by purchaser: protection, earthing and fault-protection requirements]', 'GAP_PLACEHOLDER'));
  }

  // 7. Installation
  for (const r of byType('INSTALLATION')) {
    push('installation_requirements', item(`Installation, where in the scope of supply, shall be carried out as per ${r.standardNumber} — ${r.title}.`, 'KNOWLEDGE_BASE', [r.standardId]));
  }
  if (spec.installationContext) push('installation_requirements', item(`Stated installation context: ${spec.installationContext}.`, 'SPECIFICATION_INPUT'));
  if (openGaps.some((g) => g.category === 'MISSING_INSTALLATION_REQUIREMENT')) {
    push('installation_requirements', item('[To be specified by purchaser: installation scope — supply only, or supply, installation, testing and commissioning]', 'GAP_PLACEHOLDER'));
  }

  // 8. Certification considerations — always framed as "to be verified".
  for (const c of result.certificationFindings.filter((f) => f.classification !== 'NOT_DETECTED')) {
    push('certification_considerations', item(`${c.title}: ${c.verificationNote}${c.applicableStandardDesignations.length ? ` (relates to ${c.applicableStandardDesignations.join(', ')})` : ''}`, 'KNOWLEDGE_BASE', c.applicableStandardIds));
  }
  if (!sections.get('certification_considerations')!.length) {
    push('certification_considerations', item('No certification rule in the indexed dataset matched this product. Confirm with the current BIS list of products under compulsory certification before publication.', 'DRAFTING_TEMPLATE'));
  }

  // 9. Inspection & acceptance
  for (const a of spec.acceptanceMentions) push('inspection_acceptance', item(`Stated in input: ${a}.`, 'SPECIFICATION_INPUT'));
  push(
    'inspection_acceptance',
    item('The purchaser may carry out pre-dispatch inspection and witness routine tests.', 'DRAFTING_TEMPLATE'),
    item('Acceptance shall be subject to verification of conformity with the cited standards and the stated technical requirements.', 'DRAFTING_TEMPLATE'),
  );
  if (openGaps.some((g) => g.category === 'INCOMPLETE_ACCEPTANCE_CRITERIA')) {
    push('inspection_acceptance', item('[To be specified by purchaser: acceptance tests at delivery/commissioning and warranty period]', 'GAP_PLACEHOLDER'));
  }

  // 10. Documentation
  push(
    'documentation_requirements',
    item('Technical datasheet and drawings of the offered model.', 'DRAFTING_TEMPLATE'),
    item('Type-test reports and routine test certificates as specified above.', 'DRAFTING_TEMPLATE'),
    item('Installation, operation and maintenance manuals.', 'DRAFTING_TEMPLATE'),
    item('Warranty certificate.', 'DRAFTING_TEMPLATE'),
  );
  if (result.certificationFindings.some((f) => f.classification === 'APPLICABLE' || f.classification === 'POTENTIALLY_APPLICABLE')) {
    push('documentation_requirements', item('Evidence of certification / registration where confirmed as applicable (licence or registration number).', 'DRAFTING_TEMPLATE'));
  }

  return SPEC_SECTION_KEYS.map((key) => ({ key, title: SPEC_SECTION_TITLES[key], items: sections.get(key)! }));
}

/** Validate AI-drafted prose: every cited standard must be in the allowed set; placeholders must survive. */
export function validateAiDraft(draft: SpecDraftingOutput, allowedBaseNumbers: Set<string>, requiredPlaceholders: number): { ok: true } | { ok: false; reason: string } {
  const texts = [draft.productDefinition, ...draft.technicalRequirements];
  for (const text of texts) {
    for (const citation of parseCitations(text)) {
      if (!allowedBaseNumbers.has(citation.baseNumber)) {
        return { ok: false, reason: `AI draft cited ${citation.citedAs}, which is not among the recommended standards.` };
      }
    }
  }
  const placeholders = draft.technicalRequirements.filter((t) => t.includes('[To be specified by purchaser')).length;
  if (placeholders < requiredPlaceholders) {
    return { ok: false, reason: 'AI draft removed purchaser placeholders for missing parameters.' };
  }
  if (!draft.productDefinition.trim() || !draft.technicalRequirements.length) return { ok: false, reason: 'AI draft was empty.' };
  return { ok: true };
}

export function applyAiDraft(sections: SpecSection[], draft: SpecDraftingOutput): SpecSection[] {
  return sections.map((s) => {
    if (s.key === 'product_definition') {
      const kept = s.items.filter((i) => i.origin === 'GAP_PLACEHOLDER');
      return { ...s, items: [item(draft.productDefinition.trim(), 'AI_DRAFT'), ...kept] };
    }
    if (s.key === 'technical_requirements') {
      return {
        ...s,
        items: draft.technicalRequirements.map((t) => item(t.trim(), t.includes('[To be specified by purchaser') ? 'GAP_PLACEHOLDER' : 'AI_DRAFT')),
      };
    }
    return s;
  });
}

export function baseNumbersOf(recs: StandardRecommendation[]): Set<string> {
  return new Set(recs.map((r) => r.standardNumber.match(/\d{2,6}/)?.[0]).filter((x): x is string => Boolean(x)));
}

/** Plain-text rendering used for clipboard copy and DOCX/PDF export. */
export function sectionsToPlainText(sections: SpecSection[]): string {
  return sections.map((s) => [s.title, ...s.items.map((i) => `• ${i.text}`)].join('\n')).join('\n\n');
}
