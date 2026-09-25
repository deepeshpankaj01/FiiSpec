/**
 * Stage 6 — Version & amendment intelligence.
 * A standard is only reported as "Current (verified)" when a reviewer has
 * verified it within the freshness window. Everything else is
 * "Version requires verification" or a more specific finding.
 */
import type { CitedStandard, StandardRecommendation, TimelineEntry, VersionFinding } from '../../../shared/analysis';
import type { VersionState } from '../../../shared/constants';
import type { KnowledgeBase, StandardRecord } from '../../../shared/knowledge';
import { formatCitation } from './citations';
import { designationOf } from './recommend';
import { shortHash } from './text';

/** A verification older than this no longer counts as evidence of current status. */
export const VERIFICATION_FRESHNESS_DAYS = 365;

export function isFreshlyVerified(record: StandardRecord, now: Date): boolean {
  if (record.verification.status !== 'VERIFIED' || !record.verification.verifiedAt) return false;
  const verifiedAt = new Date(record.verification.verifiedAt);
  if (Number.isNaN(verifiedAt.getTime())) return false;
  return (now.getTime() - verifiedAt.getTime()) / 86_400_000 <= VERIFICATION_FRESHNESS_DAYS;
}

export function buildTimeline(record: StandardRecord, standards: Map<string, StandardRecord>): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const history = [...record.versionHistory].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  history.forEach((v, i) => {
    entries.push({
      label: v.label,
      designation: v.designation,
      year: v.year ?? null,
      date: null,
      kind: i === 0 ? 'ORIGINAL' : 'REVISION',
      status: v.status,
      verified: false,
    });
  });
  if (record.amendmentDataStatus === 'INDEXED') {
    for (const a of [...record.amendments].sort((x, y) => x.number - y.number)) {
      entries.push({
        label: `Amendment No. ${a.number}`,
        designation: designationOf(record),
        year: a.date ? Number(a.date.slice(0, 4)) : null,
        date: a.date ?? null,
        kind: 'AMENDMENT',
        status: null,
        verified: a.verification.status === 'VERIFIED',
      });
    }
  }
  if (record.supersededBy) {
    const successor = record.supersededBy.standardId ? standards.get(record.supersededBy.standardId) : undefined;
    entries.push({
      label: 'Superseded by',
      designation: successor ? designationOf(successor) : record.supersededBy.designation,
      year: successor?.publicationYear ?? null,
      date: null,
      kind: 'SUPERSEDED_BY',
      status: successor?.status ?? null,
      verified: false,
    });
  } else {
    entries.push({
      label: record.status === 'CURRENT' ? 'Latest edition in dataset' : `Status: ${record.status.toLowerCase().replace('_', ' ')}`,
      designation: designationOf(record),
      year: record.publicationYear ?? null,
      date: null,
      kind: 'CURRENT',
      status: record.status,
      verified: record.verification.status === 'VERIFIED',
    });
  }
  return entries;
}

function stateForRecord(record: StandardRecord, now: Date): VersionState {
  if (record.status === 'SUPERSEDED') return 'SUPERSEDED';
  if (record.status === 'WITHDRAWN') return 'WITHDRAWN';
  if (record.status === 'CURRENT' && isFreshlyVerified(record, now)) return 'CURRENT_VERIFIED';
  return 'REQUIRES_VERIFICATION';
}

function amendmentText(record: StandardRecord): string {
  if (record.amendmentDataStatus === 'NOT_INDEXED') return 'Amendment data is not indexed for this standard.';
  const n = record.amendments.length;
  return n === 0 ? 'No amendments are recorded in the indexed data.' : `${n} amendment(s) recorded.`;
}

function recordMessage(record: StandardRecord, state: VersionState, standards: Map<string, StandardRecord>): string {
  const designation = designationOf(record);
  switch (state) {
    case 'CURRENT_VERIFIED':
      return `${designation} was verified as current on ${record.verification.verifiedAt?.slice(0, 10)}. ${amendmentText(record)}`;
    case 'SUPERSEDED': {
      const successor = record.supersededBy?.standardId ? standards.get(record.supersededBy.standardId) : undefined;
      return `${designation} is recorded as superseded by ${successor ? designationOf(successor) : record.supersededBy?.designation ?? 'a later standard'}.`;
    }
    case 'WITHDRAWN':
      return `${designation} is recorded as withdrawn. Do not cite it in a new tender without confirming the replacement.`;
    default:
      return `${designation} is listed as ${record.status === 'CURRENT' ? 'the latest edition' : `status "${record.status.toLowerCase()}"`} in the curated dataset, but its current status has not been verified against the official catalogue. ${amendmentText(record)} Version requires verification.`;
  }
}

export function recommendationFindings(recs: StandardRecommendation[], kb: KnowledgeBase, now: Date): VersionFinding[] {
  const standards = new Map(kb.standards.map((s) => [s.id, s]));
  const findings: VersionFinding[] = [];
  for (const rec of recs) {
    const record = standards.get(rec.standardId);
    if (!record) continue;
    const state = stateForRecord(record, now);
    findings.push({
      id: `ver-${record.id}`,
      origin: 'RECOMMENDATION',
      standardId: record.id,
      designation: designationOf(record),
      citedAs: null,
      state,
      currentDesignation: designationOf(record),
      currentStatus: record.status,
      publicationYear: record.publicationYear ?? null,
      amendmentCount: record.amendmentDataStatus === 'INDEXED' ? record.amendments.length : null,
      amendmentDataStatus: record.amendmentDataStatus,
      supersededBy: record.supersededBy?.designation ?? null,
      timeline: buildTimeline(record, standards),
      message: recordMessage(record, state, standards),
      explanation: null,
      explanationOrigin: 'RULE',
      evidenceIds: [],
    });
  }
  return findings;
}

function isIndianFamily(prefix: CitedStandard['prefix']): boolean {
  return prefix === 'IS' || prefix === 'IS/IEC' || prefix === 'IS/ISO';
}

/** Find the knowledge-base record(s) matching a citation. */
export function matchCitation(c: CitedStandard, kb: KnowledgeBase): { record: StandardRecord | null; family: StandardRecord[]; adoption: StandardRecord | null } {
  if (!isIndianFamily(c.prefix)) {
    const target = `${c.prefix} ${c.baseNumber}${c.part ? `-${c.part}` : ''}${c.section ? `-${c.section}` : ''}`.toLowerCase();
    const adoption = kb.standards.find((s) => {
      const adopted = s.adoptedFrom?.toLowerCase().replace(/:\d{4}$/, '').trim();
      return adopted === target;
    });
    return { record: null, family: [], adoption: adoption ?? null };
  }
  const family = kb.standards.filter((s) => s.baseNumber === c.baseNumber);
  if (!family.length) return { record: null, family: [], adoption: null };
  const exact = family.find((s) => (s.part ?? null) === c.part && (s.section ?? null) === c.section);
  if (exact) return { record: exact, family, adoption: null };
  if (!c.part) {
    const unparted = family.find((s) => !s.part);
    if (unparted) return { record: unparted, family, adoption: null };
  }
  return { record: null, family, adoption: null };
}

export function citationFindings(citations: CitedStandard[], kb: KnowledgeBase, now: Date): VersionFinding[] {
  const standards = new Map(kb.standards.map((s) => [s.id, s]));
  const findings: VersionFinding[] = [];

  for (const c of citations) {
    const id = `cit-${shortHash(c.citedAs)}`;
    const base: Omit<VersionFinding, 'state' | 'message'> = {
      id,
      origin: 'INPUT_REFERENCE',
      standardId: null,
      designation: formatCitation(c),
      citedAs: c.citedAs,
      currentDesignation: null,
      currentStatus: null,
      publicationYear: null,
      amendmentCount: null,
      amendmentDataStatus: null,
      supersededBy: null,
      timeline: [],
      explanation: null,
      explanationOrigin: 'RULE',
      evidenceIds: [],
    };
    const { record, family, adoption } = matchCitation(c, kb);

    if (!isIndianFamily(c.prefix)) {
      findings.push({
        ...base,
        standardId: adoption?.id ?? null,
        currentDesignation: adoption ? designationOf(adoption) : null,
        currentStatus: adoption?.status ?? null,
        state: adoption ? 'REQUIRES_VERIFICATION' : 'NOT_INDEXED',
        message: adoption
          ? `The specification cites the international standard ${c.citedAs}. The indexed Indian adoption is ${designationOf(adoption)} (${adoption.adoptedFrom}). Indian procurement should normally cite the Indian Standard; confirm equivalence and current edition.`
          : `${c.citedAs} is an international standard that is not mapped to an Indian adoption in the indexed dataset. Verify whether an equivalent Indian Standard exists.`,
        timeline: adoption ? buildTimeline(adoption, standards) : [],
      });
      continue;
    }

    if (!record) {
      findings.push({
        ...base,
        state: 'NOT_INDEXED',
        message: family.length
          ? `${c.citedAs} does not identify a part/section present in the indexed dataset. Indexed parts of IS ${c.baseNumber}: ${family.map((f) => f.standardNumber).join(', ')}. Specify the exact part.`
          : `${c.citedAs} is not in the indexed dataset. FiiSpec cannot verify its title, status or edition — verify manually on the BIS portal.`,
      });
      continue;
    }

    const recordState = stateForRecord(record, now);
    const common = {
      ...base,
      standardId: record.id,
      currentDesignation: designationOf(record),
      currentStatus: record.status,
      publicationYear: record.publicationYear ?? null,
      amendmentCount: record.amendmentDataStatus === 'INDEXED' ? record.amendments.length : null,
      amendmentDataStatus: record.amendmentDataStatus,
      supersededBy: record.supersededBy?.designation ?? null,
      timeline: buildTimeline(record, standards),
    };

    if (recordState === 'SUPERSEDED' || recordState === 'WITHDRAWN') {
      findings.push({ ...common, state: recordState, message: recordMessage(record, recordState, standards) });
      continue;
    }
    if (c.year === null) {
      findings.push({
        ...common,
        state: 'UNDATED_REFERENCE',
        message: `${c.citedAs} is cited without an edition year. State whether the latest edition including all amendments applies (dataset lists ${designationOf(record)}).`,
      });
      continue;
    }
    if (record.publicationYear && c.year < record.publicationYear) {
      const older = record.versionHistory.find((v) => v.year === c.year);
      findings.push({
        ...common,
        state: 'OUTDATED_EDITION',
        message: `${c.citedAs} refers to the ${c.year} edition${older ? ` (${older.label})` : ''}. The dataset records ${designationOf(record)} as a later edition. Update the reference after verifying the current edition.`,
      });
      continue;
    }
    if (record.publicationYear && c.year > record.publicationYear) {
      findings.push({
        ...common,
        state: 'REQUIRES_VERIFICATION',
        message: `${c.citedAs} is newer than the latest edition indexed (${designationOf(record)}). The dataset may be out of date — verify manually.`,
      });
      continue;
    }
    findings.push({ ...common, state: recordState, message: recordMessage(record, recordState, standards) });
  }
  return findings;
}
