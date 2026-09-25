/**
 * Stage 8 — Specification gap analysis and readiness scoring.
 *
 * Every gap is justified: by the category parameter template (with its
 * rationale), by quoted input text, by a version finding, or by a
 * certification finding. AI-proposed gaps are kept only if their quote is
 * found verbatim in the input.
 */
import type {
  CertificationFinding,
  ReadinessScore,
  SpecificationGap,
  StandardRecommendation,
  StructuredSpecification,
  VersionFinding,
} from '../../../shared/analysis';
import type { GapCategory, GapSeverity } from '../../../shared/constants';
import type { ProductCategory } from '../../../shared/knowledge';
import type { GapAnalysisOutput } from '../ai/prompts/gapAnalysis';
import { VAGUE_PHRASES } from './entities';
import { findUnitlessQuantities, formatParameter } from './parameters';
import { containsPhrase, escapeRegExp, normalizeText, quoteAround, shortHash } from './text';

export interface GapInput {
  spec: StructuredSpecification;
  text: string;
  category: ProductCategory | null;
  recommendations: StandardRecommendation[];
  versionFindings: VersionFinding[];
  certificationFindings: CertificationFinding[];
  ai: GapAnalysisOutput | null;
}

function gap(
  code: string,
  category: GapCategory,
  severity: GapSeverity,
  fields: Pick<SpecificationGap, 'issue' | 'whyItMatters' | 'suggestion'> & Partial<Pick<SpecificationGap, 'quote' | 'evidence' | 'relatedStandardIds' | 'origin'>>,
): SpecificationGap {
  return {
    id: `gap-${shortHash(code)}`,
    code,
    category,
    severity,
    issue: fields.issue,
    whyItMatters: fields.whyItMatters,
    suggestion: fields.suggestion,
    quote: fields.quote ?? null,
    evidence: fields.evidence ?? null,
    relatedStandardIds: fields.relatedStandardIds ?? [],
    origin: fields.origin ?? 'RULE',
    status: 'OPEN',
    statusNote: null,
    updatedBy: null,
  };
}

/** "IS 4031 (Part 1)" -> "4031" */
function baseNumberOf(standardNumber: string): string | null {
  return standardNumber.match(/\d{2,6}/)?.[0] ?? null;
}

function designationsOf(recs: StandardRecommendation[]): string {
  return recs.map((r) => r.designation).join(', ');
}

export interface GapResult {
  gaps: SpecificationGap[];
  readiness: ReadinessScore;
}

export function detectGaps(input: GapInput): GapResult {
  const { spec, category, recommendations } = input;
  const text = normalizeText(input.text);
  const lower = text.toLowerCase();
  const gaps: SpecificationGap[] = [];
  const byRelation = (type: string) => recommendations.filter((r) => r.relationship?.type === type && !r.reviewRequired);
  const designationOfId = new Map(recommendations.map((r) => [r.standardId, r.designation]));

  // 1. Missing technical parameters, from the category's parameter template.
  let covered = 0;
  const template = category?.parameterTemplate ?? [];
  for (const req of template) {
    const byKind = spec.technicalParameters.find((p) => req.quantityKinds.includes(p.kind));
    const byTerm = req.termsAny.find((t) => containsPhrase(lower, t));
    if (byKind || byTerm) {
      covered += 1;
      continue;
    }
    const related = req.relatedStandardIds.map((id) => designationOfId.get(id)).filter(Boolean) as string[];
    const outdoor = spec.environment.setting === 'OUTDOOR' || spec.environment.setting === 'INDOOR_OUTDOOR';
    const severity: GapSeverity = req.criticalWhenOutdoor && outdoor ? 'CRITICAL' : req.severity;
    gaps.push(
      gap(`MISSING_PARAMETER:${req.key}`, 'MISSING_PARAMETER', severity, {
        issue: `${req.label}: not specified.`,
        whyItMatters: req.whyItMatters,
        suggestion: req.suggestion,
        evidence: {
          statement: `Required in the FiiSpec parameter template for "${category?.label}". ${category?.templateSource ?? ''}`.trim(),
          source: related.length ? `Related standard(s): ${related.join(', ')}` : null,
          url: null,
        },
        relatedStandardIds: req.relatedStandardIds,
      }),
    );
  }

  // 2. Testing requirements.
  const testStandards = byRelation('TEST_METHOD');
  if (!spec.testingMentions.length) {
    gaps.push(
      gap('MISSING_TEST_REQUIREMENT', 'MISSING_TEST_REQUIREMENT', testStandards.length ? 'CRITICAL' : 'WARNING', {
        issue: 'No testing requirements (type tests, routine tests or test reports) are specified.',
        whyItMatters: 'Without stated tests and test reports, conformity to the cited standards cannot be demonstrated at bid evaluation or acceptance.',
        suggestion: testStandards.length
          ? `Require type-test reports from an accredited laboratory, with tests as per ${designationsOf(testStandards)}, and routine tests on each unit.`
          : 'Require type-test reports from an accredited laboratory against the applicable product standard, and routine tests on each unit.',
        evidence: testStandards.length ? { statement: `Test method standards connected to the recommended standards: ${designationsOf(testStandards)}.`, source: 'Standards relationship graph', url: null } : null,
        relatedStandardIds: testStandards.map((t) => t.standardId),
      }),
    );
  } else if (testStandards.length && !testStandards.some((t) => spec.referencedStandards.some((c) => c.baseNumber === baseNumberOf(t.standardNumber)))) {
    gaps.push(
      gap('TEST_METHOD_NOT_CITED', 'MISSING_TEST_REQUIREMENT', 'INFO', {
        issue: 'Testing is mentioned, but the test method standard is not cited.',
        whyItMatters: 'Naming the test method avoids disputes over how tests are carried out.',
        suggestion: `Cite the applicable test method: ${designationsOf(testStandards)}.`,
        relatedStandardIds: testStandards.map((t) => t.standardId),
      }),
    );
  }

  // 3. Safety requirements.
  const safetyStandards = byRelation('SAFETY');
  const electrical = category ? ['ELECTRICAL', 'ELECTROTECHNICAL_EV', 'RENEWABLE_ENERGY', 'ELECTRONICS_IT', 'MECHANICAL', 'AGRICULTURE'].includes(category.sector) : false;
  const protectionGapRaised = gaps.some((g) => g.code === 'MISSING_PARAMETER:protection');
  if (!spec.safetyRequirements.length && (safetyStandards.length || electrical) && !protectionGapRaised) {
    gaps.push(
      gap('MISSING_SAFETY_REQUIREMENT', 'MISSING_SAFETY_REQUIREMENT', safetyStandards.length ? 'CRITICAL' : 'WARNING', {
        issue: 'No safety requirements (protection, earthing, insulation, fault protection) are specified.',
        whyItMatters: 'Safety requirements protect users and installers; omitting them shifts safety decisions to the supplier.',
        suggestion: safetyStandards.length
          ? `Specify protection requirements and conformity to ${designationsOf(safetyStandards)}.`
          : 'Specify protection against electric shock, earthing and fault protection requirements.',
        evidence: safetyStandards.length ? { statement: `Safety standards connected to the recommended standards: ${designationsOf(safetyStandards)}.`, source: 'Standards relationship graph', url: null } : null,
        relatedStandardIds: safetyStandards.map((s) => s.standardId),
      }),
    );
  }

  // 4. Installation requirements.
  const installStandards = byRelation('INSTALLATION');
  const installationRelevant = Boolean(category?.requiresInstallation) || spec.environment.setting !== 'UNSPECIFIED';
  const installationStated = spec.installationContext !== null && /install|mount|erect|commission|foundation|civil|wiring|cabling/.test(lower);
  if (installationRelevant && !installationStated) {
    gaps.push(
      gap('MISSING_INSTALLATION_REQUIREMENT', 'MISSING_INSTALLATION_REQUIREMENT', installStandards.length ? 'WARNING' : 'INFO', {
        issue: 'Installation scope and requirements are not specified.',
        whyItMatters: 'It must be clear whether installation, cabling, earthing and commissioning are in the supplier’s scope and to which code they are executed.',
        suggestion: installStandards.length
          ? `State the installation scope and require installation as per ${designationsOf(installStandards)}.`
          : 'State the installation scope (supply only, or supply-install-commission) and the applicable code of practice.',
        relatedStandardIds: installStandards.map((s) => s.standardId),
      }),
    );
  }

  // 5. Certification references.
  const certNeeded = input.certificationFindings.filter((f) => (f.classification === 'APPLICABLE' || f.classification === 'POTENTIALLY_APPLICABLE') && !f.specMentionsCertification);
  if (certNeeded.length) {
    const hasApplicable = certNeeded.some((f) => f.classification === 'APPLICABLE');
    gaps.push(
      gap('MISSING_CERTIFICATION_REFERENCE', 'MISSING_CERTIFICATION_REFERENCE', hasApplicable ? 'CRITICAL' : 'WARNING', {
        issue: 'The specification does not state certification, registration or regulatory compliance requirements that may apply.',
        whyItMatters: 'Where a product is under compulsory certification, registration or a regulatory testing requirement, non-compliant bids must not be accepted.',
        suggestion: `Verify and, where confirmed, require: ${certNeeded.map((f) => f.title).join('; ')}.`,
        evidence: { statement: certNeeded.map((f) => `${f.title}: ${f.verificationNote}`).join(' '), source: certNeeded[0]?.regulatorySource.name ?? null, url: certNeeded[0]?.regulatorySource.url ?? null },
        relatedStandardIds: certNeeded.flatMap((f) => f.applicableStandardIds),
      }),
    );
  }

  // 6. Outdated / unverifiable standard references in the input.
  for (const f of input.versionFindings.filter((v) => v.origin === 'INPUT_REFERENCE')) {
    const quote = f.citedAs;
    if (f.state === 'SUPERSEDED' || f.state === 'WITHDRAWN') {
      gaps.push(
        gap(`OUTDATED_REFERENCE:${f.citedAs}`, 'OUTDATED_STANDARD_REFERENCE', 'CRITICAL', {
          issue: `${f.citedAs} is ${f.state === 'SUPERSEDED' ? 'superseded' : 'withdrawn'}.`,
          whyItMatters: 'Citing a superseded or withdrawn standard can make the tender non-compliant and exclude currently certified products.',
          suggestion: f.supersededBy ? `Replace with ${f.supersededBy} after verifying its current edition.` : 'Replace with the current standard after verification.',
          quote,
          evidence: { statement: f.message, source: 'Version record', url: null },
          relatedStandardIds: f.standardId ? [f.standardId] : [],
        }),
      );
    } else if (f.state === 'OUTDATED_EDITION') {
      gaps.push(
        gap(`OUTDATED_REFERENCE:${f.citedAs}`, 'OUTDATED_STANDARD_REFERENCE', 'WARNING', {
          issue: `${f.citedAs} cites an older edition.`,
          whyItMatters: 'Older editions may have different requirements from the edition products are currently certified to.',
          suggestion: `Cite ${f.currentDesignation} (after verifying it is the current edition), or state "latest edition including all amendments".`,
          quote,
          evidence: { statement: f.message, source: 'Version record', url: null },
          relatedStandardIds: f.standardId ? [f.standardId] : [],
        }),
      );
    } else if (f.state === 'UNDATED_REFERENCE') {
      gaps.push(
        gap(`UNDATED_REFERENCE:${f.citedAs}`, 'OUTDATED_STANDARD_REFERENCE', 'INFO', {
          issue: `${f.citedAs} is cited without an edition.`,
          whyItMatters: 'Undated references are interpreted differently by bidders; the applicable edition should be explicit.',
          suggestion: 'Add "latest edition including all amendments" or state the edition year.',
          quote,
          relatedStandardIds: f.standardId ? [f.standardId] : [],
        }),
      );
    } else if (f.state === 'NOT_INDEXED' && f.citedAs) {
      gaps.push(
        gap(`UNVERIFIED_REFERENCE:${f.citedAs}`, 'OUTDATED_STANDARD_REFERENCE', 'INFO', {
          issue: `${f.citedAs} could not be verified against the indexed dataset.`,
          whyItMatters: 'FiiSpec cannot confirm the title, status or edition of this reference.',
          suggestion: f.message,
          quote,
        }),
      );
    }
  }

  // 7. Numbers stated without units.
  for (const u of findUnitlessQuantities(text).slice(0, 5)) {
    gaps.push(
      gap(`UNDEFINED_UNIT:${u.quote.toLowerCase()}`, 'UNDEFINED_UNIT', 'WARNING', {
        issue: `A ${u.quantity} value is stated without a unit.`,
        whyItMatters: 'A value without a unit cannot be evaluated or tested objectively.',
        suggestion: `State the unit explicitly (for example kW, V, A, m³/h).`,
        quote: u.quote,
      }),
    );
  }

  // 8. Vague / unverifiable language.
  const vagueSeen = new Set<string>();
  for (const v of VAGUE_PHRASES) {
    if (vagueSeen.size >= 6) break;
    const pattern = new RegExp(`(^|[^\\p{L}])${escapeRegExp(v.phrase)}(?=$|[^\\p{L}])`, 'iu');
    const m = pattern.exec(text);
    if (!m) continue;
    if ([...vagueSeen].some((seen) => seen.includes(v.phrase) || v.phrase.includes(seen))) continue;
    vagueSeen.add(v.phrase);
    gaps.push(
      gap(`AMBIGUOUS:${v.phrase}`, 'AMBIGUOUS_REQUIREMENT', v.phrase === 'etc' ? 'INFO' : 'WARNING', {
        issue: `Ambiguous wording: "${v.phrase}".`,
        whyItMatters: v.why,
        suggestion: 'Replace with a measurable requirement (value with unit, named standard, or defined test).',
        quote: quoteAround(text, m.index + m[1]!.length),
      }),
    );
  }

  // 9. Potentially conflicting values of the same parameter.
  const conflictKinds = new Set(['POWER', 'IP_RATING', 'PHASE', 'FREQUENCY', 'EFFICIENCY_CLASS']);
  const grouped = new Map<string, typeof spec.technicalParameters>();
  for (const p of spec.technicalParameters) {
    if (!conflictKinds.has(p.kind) || p.valueMax !== null) continue;
    const key = p.kind === 'POWER' ? `${p.kind}|${p.label}` : p.kind;
    grouped.set(key, [...(grouped.get(key) ?? []), p]);
  }
  for (const [key, params] of grouped) {
    const distinct = [...new Map(params.map((p) => [formatParameter(p).toLowerCase(), p])).values()];
    if (distinct.length < 2) continue;
    gaps.push(
      gap(`CONFLICT:${key}`, 'CONFLICTING_REQUIREMENT', 'WARNING', {
        issue: `Different values are stated for ${distinct[0]!.label.toLowerCase()}: ${distinct.map(formatParameter).join(' vs ')}.`,
        whyItMatters: 'Conflicting values make bids non-comparable and create disputes at acceptance.',
        suggestion: 'Confirm the single required value, or state explicitly that multiple variants are being procured (with quantities).',
        quote: distinct.map((p) => p.rawText).join(' … '),
      }),
    );
  }

  // 10. Acceptance criteria.
  if (!spec.acceptanceMentions.length) {
    gaps.push(
      gap('INCOMPLETE_ACCEPTANCE_CRITERIA', 'INCOMPLETE_ACCEPTANCE_CRITERIA', 'WARNING', {
        issue: 'No inspection, acceptance or warranty criteria are specified.',
        whyItMatters: 'Without acceptance criteria the purchaser has no objective basis to accept or reject delivered goods.',
        suggestion: 'Specify pre-dispatch inspection, acceptance tests on delivery or commissioning, and warranty terms.',
      }),
    );
  }

  // 11. AI-identified issues — kept only if the quote is verbatim in the input.
  const existingQuotes = new Set(gaps.map((g) => g.quote?.toLowerCase()).filter(Boolean));
  for (const issue of input.ai?.issues ?? []) {
    const quote = normalizeText(issue.quote).trim();
    if (quote.length < 3 || !lower.includes(quote.toLowerCase())) continue;
    if (existingQuotes.has(quote.toLowerCase())) continue;
    existingQuotes.add(quote.toLowerCase());
    gaps.push(
      gap(`AI:${issue.category}:${quote.toLowerCase()}`, issue.category, issue.severity, {
        issue: issue.issue,
        whyItMatters: issue.whyItMatters,
        suggestion: issue.suggestion,
        quote,
        origin: 'AI',
      }),
    );
  }

  // De-duplicate by code.
  const unique = [...new Map(gaps.map((g) => [g.code, g])).values()];
  const severityOrder: GapSeverity[] = ['CRITICAL', 'WARNING', 'INFO'];
  unique.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  return { gaps: unique, readiness: readinessScore(unique, covered, template.length, Boolean(category)) };
}

export function readinessScore(gaps: SpecificationGap[], covered: number, total: number, hasCategory: boolean): ReadinessScore {
  const open = gaps.filter((g) => g.status === 'OPEN' || g.status === 'ACCEPTED');
  const counts = {
    critical: open.filter((g) => g.severity === 'CRITICAL').length,
    warning: open.filter((g) => g.severity === 'WARNING').length,
    info: open.filter((g) => g.severity === 'INFO').length,
  };
  // Missing parameters are measured by coverage; the quality penalty counts every other open gap.
  const others = open.filter((g) => g.category !== 'MISSING_PARAMETER');
  const penalty =
    others.filter((g) => g.severity === 'CRITICAL').length * 0.15 +
    others.filter((g) => g.severity === 'WARNING').length * 0.05 +
    others.filter((g) => g.severity === 'INFO').length * 0.01;
  const coverage = hasCategory && total > 0 ? covered / total : 0;
  const quality = Math.max(0, 1 - penalty);
  const score = Math.round(100 * (0.6 * coverage + 0.4 * quality));

  let label: ReadinessScore['label'] = score >= 80 ? 'PROCUREMENT_READY' : score >= 50 ? 'NEEDS_IMPROVEMENT' : 'INCOMPLETE';
  if (label === 'PROCUREMENT_READY' && counts.critical > 0) label = 'NEEDS_IMPROVEMENT';

  const explanation = hasCategory
    ? `${covered} of ${total} expected parameters are specified (60% of the score). The remaining 40% reflects specification quality: ${counts.critical} critical, ${counts.warning} warning and ${counts.info} informational issue(s) are open.`
    : 'The product category could not be established, so parameter coverage cannot be measured. The score reflects specification quality only.';

  return { score, label, parameterCoverage: { covered, total }, counts, explanation };
}
