/**
 * Format-independent report model shared by the PDF and DOCX renderers.
 */
import type {
  AnalysisDoc,
  AnalysisResultDoc,
  CertificationFinding,
  EvidenceItem,
  GeneratedSpecificationDoc,
  SpecificationGap,
  StandardRecommendation,
  VersionFinding,
} from '../../../shared/analysis';
import {
  CERTIFICATION_CLASS_LABELS,
  CONFIDENCE_LABELS,
  DISCLAIMER,
  GAP_CATEGORY_LABELS,
  GAP_SEVERITY_LABELS,
  PROVENANCE_LABELS,
  RELATIONSHIP_LABELS,
  RELEVANCE_LABEL_TEXT,
  SPEC_DOC_STATUS_LABELS,
  VERSION_STATE_LABELS,
} from '../../../shared/constants';
import { SPEC_ITEM_ORIGIN_LABELS } from '../../../shared/analysis';
import { formatParameter } from '../engine/parameters';
import { truncate } from '../engine/text';

export interface ReportStandardRow {
  designation: string;
  title: string;
  relevance: string;
  confidence: string;
  relationship: string;
  status: string;
  why: string;
  evidence: string[];
  source: string;
  action: string;
}

export interface ReportModel {
  analysisId: string;
  title: string;
  product: string;
  analysisDate: string;
  generatedAt: string;
  createdBy: string;
  status: string;
  aiMode: string;
  dataNotice: string;
  abstention: string | null;
  summary: { label: string; value: string }[];
  readiness: { score: number; label: string; explanation: string };
  specificationSummary: { label: string; value: string }[];
  parameters: { label: string; value: string }[];
  primary: ReportStandardRow[];
  related: { group: string; rows: ReportStandardRow[] }[];
  versions: { designation: string; state: string; message: string }[];
  certification: { title: string; classification: string; why: string; note: string; source: string }[];
  gaps: { severity: string; category: string; issue: string; why: string; suggestion: string; quote: string | null }[];
  specification: { heading: string; status: string; sections: { title: string; items: { text: string; origin: string }[] }[] } | null;
  disclaimer: string;
}

function row(r: StandardRecommendation, evidence: EvidenceItem[]): ReportStandardRow {
  return {
    designation: r.designation,
    title: r.title,
    relevance: `${RELEVANCE_LABEL_TEXT[r.relevanceLabel]} (${r.score}/100)`,
    confidence: CONFIDENCE_LABELS[r.confidence],
    relationship: r.relationship ? `${RELATIONSHIP_LABELS[r.relationship.type]} of ${r.relationship.fromDesignation}` : 'Primary standard',
    status: VERSION_STATE_LABELS[r.versionState],
    why: r.reasons.slice(0, 2).join(' '),
    // The relationship statement is already in "why"; show the other evidence kinds, briefly.
    evidence: evidence
      .filter((e) => r.evidenceIds.includes(e.id) && e.kind !== 'RELATIONSHIP_PROVENANCE')
      .slice(0, 2)
      .map((e) => `${PROVENANCE_LABELS[e.provenanceClass]}: ${truncate(e.statement, 220)}`),
    source: r.sourceUrl ? `${r.sourceName} — ${r.sourceUrl}` : r.sourceName,
    action: r.nextAction,
  };
}

function environmentText(env: AnalysisResultDoc['specification']['environment']): string {
  if (env.setting === 'UNSPECIFIED') return 'Not stated';
  const extra = [...new Set(env.conditions.filter((c) => !/^(outdoor|outdoors|indoor|indoors)$/i.test(c)))];
  return `${env.setting.toLowerCase().replace('_', ' / ')}${extra.length ? ` — ${extra.join(', ')}` : ''}`;
}

const RELATED_ORDER =['NORMATIVE_REFERENCE', 'TEST_METHOD', 'SAFETY', 'INSTALLATION', 'TERMINOLOGY', 'RELATED_PRODUCT', 'RELATED_STANDARD'] as const;

export function buildReportModel(input: {
  analysis: AnalysisDoc;
  result: AnalysisResultDoc;
  gaps: SpecificationGap[];
  evidence: EvidenceItem[];
  specification: GeneratedSpecificationDoc | null;
  generatedAt: string;
}): ReportModel {
  const { analysis, result, gaps, evidence, specification } = input;
  const spec = result.specification;
  const recs = result.recommendations;
  const certs: CertificationFinding[] = result.certificationFindings;
  const versions: VersionFinding[] = result.versionFindings;
  const openGaps = gaps.filter((g) => g.status === 'OPEN' || g.status === 'ACCEPTED');

  return {
    analysisId: analysis.id,
    title: analysis.title,
    product: spec.productName,
    analysisDate: (analysis.completedAt ?? analysis.createdAt).slice(0, 10),
    generatedAt: input.generatedAt,
    createdBy: analysis.createdByName,
    status: analysis.status === 'REVIEW_REQUIRED' ? 'Review required' : analysis.status === 'COMPLETED' ? 'Completed' : analysis.status,
    aiMode: result.trace.aiMode === 'AI_ASSISTED' ? `AI-assisted (${result.trace.model ?? 'model not recorded'})` : 'Deterministic analysis only (AI not used)',
    dataNotice:
      'Standards data in this prototype comes from a curated benchmark dataset compiled from public references. Records not marked as verified must be confirmed against the current BIS catalogue before use.',
    abstention: result.abstention.abstained ? `${result.abstention.message} ${result.abstention.reasons.join(' ')}` : null,
    summary: [
      { label: 'Standards identified', value: String(result.summary.standardsIdentified) },
      { label: 'High-confidence matches', value: String(result.summary.highConfidence) },
      { label: 'Review-required matches', value: String(result.summary.reviewRequired) },
      { label: 'Potential gaps', value: String(openGaps.length) },
      { label: 'Certification flags', value: String(result.summary.certificationFlags) },
    ],
    readiness: { score: result.readiness.score, label: result.readiness.label.replace(/_/g, ' ').toLowerCase(), explanation: result.readiness.explanation },
    specificationSummary: [
      { label: 'Product', value: spec.productName },
      { label: 'Category', value: spec.productCategoryLabel ? `${spec.productCategoryLabel} (${CONFIDENCE_LABELS[spec.categoryConfidence].toLowerCase()})` : 'Not established' },
      { label: 'Intended use', value: spec.intendedUse ?? 'Not stated' },
      { label: 'Environment', value: environmentText(spec.environment) },
      { label: 'Input language', value: spec.language.detected },
      { label: 'Standards cited in input', value: spec.referencedStandards.map((c) => c.citedAs).join(', ') || 'None' },
    ],
    parameters: spec.technicalParameters.map((p) => ({ label: p.label, value: `${formatParameter(p)}${p.origin === 'AI' ? ' (AI-interpreted)' : ''}` })),
    primary: recs.filter((r) => r.tier === 'PRIMARY').map((r) => row(r, evidence)),
    related: RELATED_ORDER.map((type) => ({
      group: RELATIONSHIP_LABELS[type],
      rows: recs.filter((r) => r.tier === 'RELATED' && r.relationship?.type === type).map((r) => row(r, evidence)),
    })).filter((g) => g.rows.length),
    versions: versions.map((v) => ({
      designation: v.citedAs ? `${v.citedAs} (cited in input)` : v.designation,
      state: VERSION_STATE_LABELS[v.state],
      message: v.explanation ? `${v.message} ${v.explanation}` : v.message,
    })),
    certification: certs.map((c) => ({
      title: c.title,
      classification: CERTIFICATION_CLASS_LABELS[c.classification],
      why: c.why,
      note: c.verificationNote,
      source: c.regulatorySource.url ? `${c.regulatorySource.name} — ${c.regulatorySource.url}` : c.regulatorySource.name,
    })),
    gaps: openGaps.map((g) => ({
      severity: GAP_SEVERITY_LABELS[g.severity],
      category: GAP_CATEGORY_LABELS[g.category],
      issue: g.issue,
      why: g.whyItMatters,
      suggestion: g.suggestion,
      quote: g.quote,
    })),
    specification: specification
      ? {
          heading: `Procurement specification — version ${specification.version}`,
          status: SPEC_DOC_STATUS_LABELS[specification.status],
          sections: specification.sections.map((s) => ({ title: s.title, items: s.items.map((i) => ({ text: i.text, origin: SPEC_ITEM_ORIGIN_LABELS[i.origin] })) })),
        }
      : null,
    disclaimer: DISCLAIMER,
  };
}
