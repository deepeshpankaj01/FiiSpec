/**
 * Evidence assembly. Every recommendation, version finding, certification
 * finding and gap gets explicit evidence items, each carrying one of the four
 * provenance classes so the UI can always distinguish verified information,
 * curated data, AI interpretation and review-required information.
 */
import type {
  CertificationFinding,
  EvidenceItem,
  SpecificationGap,
  StandardRecommendation,
  VersionFinding,
} from '../../../shared/analysis';
import type { ProvenanceClass } from '../../../shared/constants';
import type { KnowledgeBase, SourceRef, StandardRecord } from '../../../shared/knowledge';
import { isVerifiedOfficial } from './recommend';
import { truncate } from './text';

function standardProvenance(s: StandardRecord): ProvenanceClass {
  return isVerifiedOfficial(s) ? 'VERIFIED_OFFICIAL' : 'CURATED_BENCHMARK';
}

function sourceOf(ref: SourceRef | undefined | null): EvidenceItem['source'] {
  if (!ref) return null;
  return { name: ref.name, url: ref.url ?? null, retrievedAt: ref.retrievedAt ?? null };
}

export interface EvidenceBundle {
  items: EvidenceItem[];
}

export function buildEvidence(
  kb: KnowledgeBase,
  recommendations: StandardRecommendation[],
  versionFindings: VersionFinding[],
  certificationFindings: CertificationFinding[],
  gaps: SpecificationGap[],
): EvidenceBundle {
  const standards = new Map(kb.standards.map((s) => [s.id, s]));
  const relationships = new Map(kb.relationships.map((r) => [r.id, r]));
  const rules = new Map(kb.certificationRules.map((r) => [r.id, r]));
  const items: EvidenceItem[] = [];
  const add = (item: Omit<EvidenceItem, 'id'>, owner: { evidenceIds: string[] }): void => {
    const id = `ev-${item.targetId}-${item.kind.toLowerCase()}-${owner.evidenceIds.length + 1}`.replace(/[^A-Za-z0-9_-]/g, '-');
    items.push({ ...item, id });
    owner.evidenceIds.push(id);
  };

  for (const rec of recommendations) {
    const s = standards.get(rec.standardId);
    if (!s) continue;
    add(
      {
        targetType: 'RECOMMENDATION',
        targetId: rec.id,
        kind: 'SCOPE_MATCH',
        statement: rec.matchedTerms.length
          ? `Scope and keywords match the requirement on: ${rec.matchedTerms.slice(0, 8).join(', ')}.`
          : 'Included through its relationship to a primary standard; no direct keyword overlap.',
        excerpt: `Curated scope summary: ${truncate(s.scope, 400)}`,
        source: sourceOf(s.source),
        provenanceClass: standardProvenance(s),
        verificationStatus: s.verification.status,
      },
      rec,
    );
    const product = rec.factors.find((f) => f.key === 'product');
    if (product && product.value > 0) {
      add(
        {
          targetType: 'RECOMMENDATION',
          targetId: rec.id,
          kind: 'METADATA_MATCH',
          statement: product.explanation,
          excerpt: `Recorded product types: ${s.productTypes.join(', ') || 'none'}; sector: ${s.sector}.`,
          source: sourceOf(s.source),
          provenanceClass: standardProvenance(s),
          verificationStatus: s.verification.status,
        },
        rec,
      );
    }
    if (rec.relationship) {
      const rel = relationships.get(rec.relationship.relationshipId);
      add(
        {
          targetType: 'RECOMMENDATION',
          targetId: rec.id,
          kind: 'RELATIONSHIP_PROVENANCE',
          statement: rec.relationship.statement,
          excerpt: rec.relationship.contextNote,
          source: sourceOf(rel?.provenance.source ?? null) ?? { name: 'FiiSpec curated relationship', url: null, retrievedAt: null },
          provenanceClass:
            rel && rel.verification.status === 'VERIFIED' && rel.provenance.type !== 'CURATED_EXPERT' ? 'VERIFIED_OFFICIAL' : 'CURATED_BENCHMARK',
          verificationStatus: rel?.verification.status ?? null,
        },
        rec,
      );
    }
    const version = versionFindings.find((v) => v.origin === 'RECOMMENDATION' && v.standardId === rec.standardId);
    if (version) {
      add(
        {
          targetType: 'RECOMMENDATION',
          targetId: rec.id,
          kind: 'VERSION_RECORD',
          statement: version.message,
          excerpt: null,
          source: sourceOf(s.source),
          provenanceClass: version.state === 'CURRENT_VERIFIED' ? 'VERIFIED_OFFICIAL' : version.state === 'REQUIRES_VERIFICATION' ? 'HUMAN_REVIEW_REQUIRED' : 'CURATED_BENCHMARK',
          verificationStatus: s.verification.status,
        },
        rec,
      );
    }
    if (rec.aiAssessment) {
      add(
        {
          targetType: 'RECOMMENDATION',
          targetId: rec.id,
          kind: 'AI_ASSESSMENT',
          statement: rec.aiAssessment.rationale,
          excerpt: `AI relevance ${rec.aiAssessment.relevance.toFixed(2)} · role ${rec.aiAssessment.role.toLowerCase().replace('_', ' ')} · prompt v${rec.aiAssessment.promptVersion}`,
          source: null,
          provenanceClass: 'AI_INTERPRETATION',
          verificationStatus: null,
        },
        rec,
      );
    }
  }

  for (const v of versionFindings.filter((f) => f.origin === 'INPUT_REFERENCE')) {
    const s = v.standardId ? standards.get(v.standardId) : undefined;
    add(
      {
        targetType: 'VERSION',
        targetId: v.id,
        kind: 'INPUT_QUOTE',
        statement: `Your specification cites "${v.citedAs}".`,
        excerpt: v.citedAs,
        source: null,
        provenanceClass: 'CURATED_BENCHMARK',
        verificationStatus: null,
      },
      v,
    );
    add(
      {
        targetType: 'VERSION',
        targetId: v.id,
        kind: 'VERSION_RECORD',
        statement: v.message,
        excerpt: null,
        source: sourceOf(s?.source ?? null),
        provenanceClass: v.state === 'NOT_INDEXED' || v.state === 'REQUIRES_VERIFICATION' ? 'HUMAN_REVIEW_REQUIRED' : s ? standardProvenance(s) : 'CURATED_BENCHMARK',
        verificationStatus: s?.verification.status ?? null,
      },
      v,
    );
  }

  for (const c of certificationFindings) {
    const rule = c.ruleId ? rules.get(c.ruleId) : undefined;
    if (rule) {
      add(
        {
          targetType: 'CERTIFICATION',
          targetId: c.id,
          kind: 'CERTIFICATION_RULE',
          statement: rule.explanation,
          excerpt: `${rule.instrument} — ${rule.authority}. Condition: ${rule.conditionDescription}`,
          source: sourceOf(rule.source),
          provenanceClass: isVerifiedOfficial(rule) ? 'VERIFIED_OFFICIAL' : 'CURATED_BENCHMARK',
          verificationStatus: rule.verification.status,
        },
        c,
      );
    }
    if (c.conditionAssessment.supportingText) {
      add(
        {
          targetType: 'CERTIFICATION',
          targetId: c.id,
          kind: c.conditionAssessment.origin === 'AI' ? 'AI_ASSESSMENT' : 'INPUT_QUOTE',
          statement: c.conditionAssessment.origin === 'AI' ? 'AI assessment of the rule condition, grounded in your text.' : 'Matched condition term in your specification.',
          excerpt: c.conditionAssessment.supportingText,
          source: null,
          provenanceClass: c.conditionAssessment.origin === 'AI' ? 'AI_INTERPRETATION' : 'CURATED_BENCHMARK',
          verificationStatus: null,
        },
        c,
      );
    }
  }

  for (const g of gaps) {
    const holder = { evidenceIds: [] as string[] };
    if (g.quote) {
      add(
        {
          targetType: 'GAP',
          targetId: g.id,
          kind: 'INPUT_QUOTE',
          statement: 'Quoted from your specification.',
          excerpt: g.quote,
          source: null,
          provenanceClass: g.origin === 'AI' ? 'AI_INTERPRETATION' : 'CURATED_BENCHMARK',
          verificationStatus: null,
        },
        holder,
      );
    }
    if (g.evidence) {
      add(
        {
          targetType: 'GAP',
          targetId: g.id,
          kind:
            g.category === 'MISSING_PARAMETER'
              ? 'PARAMETER_TEMPLATE'
              : g.category === 'OUTDATED_STANDARD_REFERENCE'
                ? 'VERSION_RECORD'
                : g.category === 'MISSING_CERTIFICATION_REFERENCE'
                  ? 'CERTIFICATION_RULE'
                  : 'RELATIONSHIP_PROVENANCE',
          statement: g.evidence.statement,
          excerpt: g.evidence.source,
          source: g.evidence.url ? { name: g.evidence.source ?? 'Source', url: g.evidence.url, retrievedAt: null } : null,
          provenanceClass: 'CURATED_BENCHMARK',
          verificationStatus: null,
        },
        holder,
      );
    }
  }

  return { items };
}
