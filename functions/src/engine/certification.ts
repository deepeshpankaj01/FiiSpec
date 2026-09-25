/**
 * Stage 7 — Certification intelligence.
 *
 * Classification is deterministic, driven by curated certification rules.
 * AI may only assess whether a rule's scope condition appears to be met; it
 * can never raise a classification above what a verified rule supports.
 */
import type { CertificationFinding, StandardRecommendation, StructuredSpecification } from '../../../shared/analysis';
import type { CertificationClass, CertificationScheme, ConfidenceLevel } from '../../../shared/constants';
import { CERTIFICATION_SCHEME_LABELS } from '../../../shared/constants';
import type { CertificationRule, KnowledgeBase, StandardRecord } from '../../../shared/knowledge';
import type { CertificationAssessmentOutput } from '../ai/prompts/certificationClassification';
import { designationOf } from './recommend';
import { containsPhrase, normalizeText } from './text';

export const EVALUATED_SCHEMES: CertificationScheme[] = [
  'BIS_PRODUCT_CERTIFICATION',
  'BIS_COMPULSORY_REGISTRATION',
  'QUALITY_CONTROL_ORDER',
  'ENERGY_LABELLING',
  'REGULATORY_REQUIREMENT',
];

const CERT_TERMS: Record<CertificationScheme, string[]> = {
  BIS_PRODUCT_CERTIFICATION: ['isi', 'isi mark', 'isi marked', 'bis certified', 'bis certification', 'bis licence', 'bis license', 'standard mark'],
  BIS_COMPULSORY_REGISTRATION: ['crs', 'compulsory registration', 'bis registration', 'r-number', 'registration number'],
  QUALITY_CONTROL_ORDER: ['quality control order', 'qco', 'isi mark', 'bis certified'],
  ENERGY_LABELLING: ['bee', 'star label', 'star rated', 'star rating', 'energy label'],
  REGULATORY_REQUIREMENT: ['cea', 'central electricity authority', 'regulations', 'guidelines'],
};

export interface CandidateRule {
  rule: CertificationRule;
  matchedStandards: StandardRecord[];
  categoryMatched: boolean;
}

export function candidateRules(spec: StructuredSpecification, recs: StandardRecommendation[], kb: KnowledgeBase): CandidateRule[] {
  const recommendedIds = new Set(recs.filter((r) => r.tier === 'PRIMARY' || r.relationship?.type === 'RELATED_PRODUCT').map((r) => r.standardId));
  const standards = new Map(kb.standards.map((s) => [s.id, s]));
  const category = kb.categories.find((c) => c.id === spec.productCategoryId);
  const categoryIds = new Set([spec.productCategoryId, category?.parentId].filter((x): x is string => Boolean(x)));
  const out: CandidateRule[] = [];
  for (const rule of kb.certificationRules) {
    if (rule.lifecycle !== 'PUBLISHED') continue;
    const matchedStandards = rule.standardIds.filter((id) => recommendedIds.has(id)).map((id) => standards.get(id)).filter((s): s is StandardRecord => Boolean(s));
    const categoryMatched = rule.productCategories.some((c) => categoryIds.has(c));
    if (matchedStandards.length || categoryMatched) out.push({ rule, matchedStandards, categoryMatched });
  }
  return out;
}

function cap(classification: CertificationClass, max: CertificationClass): CertificationClass {
  const order: CertificationClass[] = ['APPLICABLE', 'POTENTIALLY_APPLICABLE', 'MANUAL_VERIFICATION', 'NOT_DETECTED'];
  return order[Math.max(order.indexOf(classification), order.indexOf(max))]!;
}

export function evaluateCertification(
  spec: StructuredSpecification,
  recs: StandardRecommendation[],
  kb: KnowledgeBase,
  text: string,
  ai: CertificationAssessmentOutput | null,
): CertificationFinding[] {
  const textLower = normalizeText(text).toLowerCase();
  const findings: CertificationFinding[] = [];
  const aiById = new Map((ai?.assessments ?? []).map((a) => [a.ruleId, a]));

  for (const { rule, matchedStandards, categoryMatched } of candidateRules(spec, recs, kb)) {
    // Condition assessment: deterministic term check, optionally refined by grounded AI assessment.
    let condition: CertificationFinding['conditionAssessment'];
    if (!rule.conditionTermsAny.length) {
      condition = { status: 'NOT_APPLICABLE', supportingText: null, origin: 'RULE' };
    } else {
      const hit = rule.conditionTermsAny.find((t) => containsPhrase(textLower, t));
      condition = hit
        ? { status: 'MET', supportingText: hit, origin: 'RULE' }
        : { status: 'UNCLEAR', supportingText: null, origin: 'RULE' };
    }
    const aiAssessment = aiById.get(rule.id);
    if (aiAssessment && condition.status !== 'MET') {
      const quote = aiAssessment.supportingQuote?.trim() ?? null;
      const grounded = quote ? textLower.includes(normalizeText(quote).toLowerCase()) : false;
      if (aiAssessment.conditionStatus === 'MET' && grounded) condition = { status: 'MET', supportingText: quote, origin: 'AI' };
      else if (aiAssessment.conditionStatus === 'NOT_MET') condition = { status: 'NOT_MET', supportingText: grounded ? quote : null, origin: 'AI' };
    }

    const verified = rule.verification.status === 'VERIFIED';
    let classification: CertificationClass;
    if (condition.status === 'MET' || condition.status === 'NOT_APPLICABLE') {
      classification = verified && matchedStandards.length ? rule.classificationWhenMatched : cap(rule.classificationWhenMatched, 'POTENTIALLY_APPLICABLE');
    } else {
      // UNCLEAR, or an AI-inferred NOT_MET: never conclude "not applicable" from inference.
      classification = 'MANUAL_VERIFICATION';
    }

    const confidence: ConfidenceLevel =
      classification === 'APPLICABLE'
        ? 'HIGH'
        : classification === 'POTENTIALLY_APPLICABLE'
          ? matchedStandards.length
            ? 'MEDIUM'
            : 'LOW'
          : classification === 'NOT_DETECTED'
            ? 'LOW'
            : 'REVIEW_REQUIRED';

    const why: string[] = [];
    if (matchedStandards.length) why.push(`The rule covers ${matchedStandards.map(designationOf).join(', ')}, which FiiSpec recommends for this product.`);
    if (categoryMatched) why.push('The rule lists this product category in its scope.');
    if (condition.status === 'MET') why.push(`Scope condition appears to be met (${condition.origin === 'AI' ? 'AI assessment' : 'matched term'}: "${condition.supportingText}").`);
    if (condition.status === 'UNCLEAR') why.push(`The specification does not state enough to confirm the rule's condition: ${rule.conditionDescription}`);
    if (condition.status === 'NOT_MET') why.push('AI assessment suggests the condition may not be met; this is an inference and needs human confirmation.');

    const verificationNote =
      classification === 'APPLICABLE'
        ? 'Applicable per a verified rule — confirm against the current official notification before publishing the tender.'
        : classification === 'POTENTIALLY_APPLICABLE'
          ? 'Potentially applicable — verify against the current official requirement.'
          : classification === 'NOT_DETECTED'
            ? `Not detected as of the rule's source date — re-check the current official list before relying on this.`
            : 'Manual verification required — FiiSpec could not establish applicability from the specification.';

    const schemeTerms = CERT_TERMS[rule.scheme];
    findings.push({
      id: `cert-${rule.id}`,
      ruleId: rule.id,
      scheme: rule.scheme,
      title: rule.title,
      classification,
      why: why.join(' '),
      conditionAssessment: condition,
      applicableStandardIds: matchedStandards.map((s) => s.id),
      applicableStandardDesignations: matchedStandards.map(designationOf),
      regulatorySource: { name: rule.source.name, url: rule.source.url ?? null, authority: rule.authority, instrument: rule.instrument },
      confidence,
      verificationNote,
      ruleVerificationStatus: rule.verification.status,
      specMentionsCertification: schemeTerms.some((t) => containsPhrase(textLower, t)),
      evidenceIds: [],
    });
  }

  // Explicit "not detected" entries so absence is never mistaken for a clearance.
  for (const scheme of EVALUATED_SCHEMES) {
    if (findings.some((f) => f.scheme === scheme)) continue;
    findings.push({
      id: `cert-none-${scheme.toLowerCase()}`,
      ruleId: null,
      scheme,
      title: CERTIFICATION_SCHEME_LABELS[scheme],
      classification: 'NOT_DETECTED',
      why: 'No rule in the indexed certification dataset matched this product or its recommended standards.',
      conditionAssessment: { status: 'NOT_APPLICABLE', supportingText: null, origin: 'RULE' },
      applicableStandardIds: [],
      applicableStandardDesignations: [],
      regulatorySource: { name: 'Indexed FiiSpec certification rules', url: null, authority: '—', instrument: '—' },
      confidence: 'LOW',
      verificationNote: 'Not detected in the indexed rules — this does not establish that no requirement applies.',
      ruleVerificationStatus: null,
      specMentionsCertification: CERT_TERMS[scheme].some((t) => containsPhrase(textLower, t)),
      evidenceIds: [],
    });
  }

  const order: CertificationClass[] = ['APPLICABLE', 'POTENTIALLY_APPLICABLE', 'MANUAL_VERIFICATION', 'NOT_DETECTED'];
  return findings.sort((a, b) => order.indexOf(a.classification) - order.indexOf(b.classification));
}
