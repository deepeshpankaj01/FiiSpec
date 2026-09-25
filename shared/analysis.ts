/**
 * Analysis domain types. These describe the documents written by the
 * pipeline (Cloud Functions) and rendered by the web app.
 */
import type {
  AiMode,
  AnalysisStatus,
  CertificationClass,
  CertificationScheme,
  ConfidenceLevel,
  EvidenceKind,
  GapCategory,
  GapSeverity,
  GapStatus,
  InputMode,
  PipelineStage,
  ProvenanceClass,
  QuantityKind,
  RelationshipProvenanceType,
  RelationshipType,
  RelevanceLabel,
  ReviewStatus,
  SectorId,
  SpecDocStatus,
  StageState,
  StandardKind,
  StandardStatus,
  VerificationStatus,
  VersionState,
} from './constants';
import type { SourceRef } from './knowledge';

/** Firestore timestamps are serialised to ISO strings in these shared types. */
export type IsoString = string;

// ---------------------------------------------------------------------------
// Analysis document: analyses/{analysisId}
// ---------------------------------------------------------------------------

export interface StageProgress {
  state: StageState;
  startedAt?: IsoString;
  finishedAt?: IsoString;
  durationMs?: number;
}

export interface AnalysisSummary {
  standardsIdentified: number;
  primaryStandards: number;
  highConfidence: number;
  reviewRequired: number;
  gaps: number;
  criticalGaps: number;
  certificationFlags: number;
  readinessScore: number | null;
  abstained: boolean;
}

export interface AnalysisError {
  code: AnalysisErrorCode;
  message: string;
  nextStep: string;
  retryable: boolean;
}

export type AnalysisErrorCode =
  | 'UPLOAD_FAILED'
  | 'UPLOAD_EXPIRED'
  | 'INVALID_FILE'
  | 'UNSUPPORTED_FORMAT'
  | 'EMPTY_DOCUMENT'
  | 'AI_UNAVAILABLE'
  | 'PROCESSING_TIMEOUT'
  | 'NO_RELEVANT_STANDARDS'
  | 'INTERNAL_ERROR';

export interface AnalysisDoc {
  id: string;
  orgId: string;
  createdBy: string;
  createdByName: string;
  title: string;
  productName: string;
  inputMode: InputMode;
  status: AnalysisStatus;
  currentStage: PipelineStage | null;
  stages: Partial<Record<PipelineStage, StageProgress>>;
  summary: AnalysisSummary | null;
  error: AnalysisError | null;
  reviewStatus: ReviewStatus;
  specStatus: SpecDocStatus | 'NONE';
  aiMode: AiMode | null;
  detectedLanguage: string | null;
  file: UploadedFileInfo | null;
  isDemo: boolean;
  benchmarkCaseId: string | null;
  attempt: number;
  createdAt: IsoString;
  updatedAt: IsoString;
  completedAt: IsoString | null;
}

export interface UploadedFileInfo {
  name: string;
  size: number;
  contentType: string;
  storagePath: string;
}

// ---------------------------------------------------------------------------
// Input document: analyses/{analysisId}/inputs/primary
// ---------------------------------------------------------------------------

export interface AnalysisInputForm {
  product?: string;
  purpose?: string;
  technicalSpecification?: string;
  description?: string;
  categoryHint?: string;
  procurementContext?: string;
}

export interface AnalysisInputDoc {
  mode: InputMode;
  form: AnalysisInputForm;
  /** Combined text fed to the pipeline (form text, or text extracted from the document). */
  text: string;
  truncated: boolean;
  document: {
    pageCount: number | null;
    method: 'PDF_TEXT' | 'DOCX' | null;
    /** Firestore cannot store nested arrays, so table rows/cells are wrapped in objects. */
    tables: { rows: { cells: string[] }[] }[];
    warnings: string[];
    contentHash: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Structured specification (Stage 1)
// ---------------------------------------------------------------------------

export type FieldConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ExtractedParameter {
  id: string;
  kind: QuantityKind;
  label: string;
  /** Exact text the parameter was read from. */
  rawText: string;
  value: number | null;
  valueMax: number | null;
  unit: string | null;
  normalizedValue: number | null;
  normalizedValueMax: number | null;
  normalizedUnit: string | null;
  textValue: string | null;
  confidence: FieldConfidence;
  origin: 'DETERMINISTIC' | 'AI';
  note: string | null;
}

export interface CitedStandard {
  /** Exactly as written in the input, e.g. "IS 8112:1989". */
  citedAs: string;
  prefix: 'IS' | 'IS/IEC' | 'IS/ISO' | 'IEC' | 'ISO';
  baseNumber: string;
  part: string | null;
  section: string | null;
  year: number | null;
}

export interface ExtractedEntity {
  type: 'PRODUCT' | 'MATERIAL' | 'ENVIRONMENT' | 'CERTIFICATION' | 'STANDARD' | 'PARAMETER' | 'ORGANIZATION' | 'LOCATION';
  text: string;
}

export interface LanguageInfo {
  detected: 'en' | 'hi' | 'hi-Latn' | 'mixed' | 'other';
  script: 'LATIN' | 'DEVANAGARI' | 'MIXED' | 'OTHER';
  normalization: 'NOT_REQUIRED' | 'AI_NORMALIZED' | 'UNAVAILABLE';
}

export interface StructuredSpecification {
  productName: string;
  productCategoryId: string | null;
  productCategoryLabel: string | null;
  categoryConfidence: ConfidenceLevel;
  categoryAlternatives: { id: string; label: string }[];
  categoryEvidence: string[];
  intendedUse: string | null;
  industry: SectorId | null;
  technicalParameters: ExtractedParameter[];
  materials: string[];
  environment: {
    setting: 'INDOOR' | 'OUTDOOR' | 'INDOOR_OUTDOOR' | 'UNSPECIFIED';
    conditions: string[];
  };
  capacity: string | null;
  safetyRequirements: string[];
  installationContext: string | null;
  procurementContext: string | null;
  referencedStandards: CitedStandard[];
  certificationMentions: string[];
  testingMentions: string[];
  acceptanceMentions: string[];
  extractedEntities: ExtractedEntity[];
  missingFields: string[];
  uncertainFields: string[];
  language: LanguageInfo;
  /** English normalised restatement of the requirement (AI-produced when available, otherwise the input itself). */
  normalizedSummary: string;
  origin: 'DETERMINISTIC' | 'AI_ASSISTED';
}

// ---------------------------------------------------------------------------
// Recommendations (Stages 2–4, 9)
// ---------------------------------------------------------------------------

export interface ScoreFactor {
  key: 'semantic' | 'product' | 'scope' | 'industry' | 'relationship' | 'version';
  label: string;
  /** 0..1 */
  value: number;
  weight: number;
  /** value × weight × 100 */
  contribution: number;
  explanation: string;
}

export interface RecommendationRelationship {
  type: RelationshipType;
  fromStandardId: string;
  fromDesignation: string;
  relationshipId: string;
  provenanceType: RelationshipProvenanceType;
  statement: string;
  contextNote: string | null;
}

export interface AiRelevanceAssessment {
  relevance: number;
  role: 'PRIMARY_PRODUCT' | 'SUPPORTING' | 'NOT_RELEVANT';
  rationale: string;
  promptVersion: string;
}

export interface StandardRecommendation {
  id: string;
  standardId: string;
  standardNumber: string;
  designation: string;
  title: string;
  kind: StandardKind;
  sector: SectorId;
  tier: 'PRIMARY' | 'RELATED';
  relationship: RecommendationRelationship | null;
  score: number;
  relevanceLabel: RelevanceLabel;
  confidence: ConfidenceLevel;
  factors: ScoreFactor[];
  reasons: string[];
  matchedTerms: string[];
  status: StandardStatus;
  versionState: VersionState;
  verificationStatus: VerificationStatus;
  provenanceClass: ProvenanceClass;
  evidenceIds: string[];
  aiAssessment: AiRelevanceAssessment | null;
  nextAction: string;
  reviewRequired: boolean;
  reviewReasons: string[];
  sourceUrl: string | null;
  sourceName: string;
}

// ---------------------------------------------------------------------------
// Graph (Stage 5) — stored separately and fetched on demand
// ---------------------------------------------------------------------------

export type GraphNodeGroup =
  | 'PRODUCT'
  | 'PRIMARY'
  | 'NORMATIVE_REFERENCE'
  | 'TEST_METHOD'
  | 'SAFETY'
  | 'INSTALLATION'
  | 'TERMINOLOGY'
  | 'RELATED_PRODUCT'
  | 'RELATED_STANDARD'
  | 'AMENDMENT'
  | 'SUPERSEDED';

export interface GraphNode {
  id: string;
  standardId: string | null;
  label: string;
  title: string;
  group: GraphNodeGroup;
  status: StandardStatus | null;
  confidence: ConfidenceLevel | null;
  depth: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** APPLIES_TO links the analysed product to its primary standards (a FiiSpec ranking result, not a curated relationship). */
  type: RelationshipType | 'APPLIES_TO';
  provenanceType: RelationshipProvenanceType | 'FIISPEC_RANKING';
  statement: string;
  contextNote: string | null;
  source_ref: SourceRef | null;
  verificationStatus: VerificationStatus;
  /** Product-specific explanation (AI-generated when available; clearly labelled). */
  explanation: string | null;
  explanationOrigin: 'AI' | 'RULE' | null;
}

export interface StandardsGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Version intelligence (Stage 6)
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  label: string;
  designation: string;
  year: number | null;
  date: string | null;
  kind: 'ORIGINAL' | 'REVISION' | 'AMENDMENT' | 'SUPERSEDED_BY' | 'CURRENT';
  status: StandardStatus | null;
  verified: boolean;
}

export interface VersionFinding {
  id: string;
  origin: 'RECOMMENDATION' | 'INPUT_REFERENCE';
  standardId: string | null;
  designation: string;
  citedAs: string | null;
  state: VersionState;
  currentDesignation: string | null;
  currentStatus: StandardStatus | null;
  publicationYear: number | null;
  amendmentCount: number | null;
  amendmentDataStatus: 'INDEXED' | 'NOT_INDEXED' | null;
  supersededBy: string | null;
  timeline: TimelineEntry[];
  message: string;
  explanation: string | null;
  explanationOrigin: 'AI' | 'RULE';
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Certification intelligence (Stage 7)
// ---------------------------------------------------------------------------

export interface CertificationFinding {
  id: string;
  ruleId: string | null;
  scheme: CertificationScheme;
  title: string;
  classification: CertificationClass;
  why: string;
  conditionAssessment: {
    status: 'MET' | 'NOT_MET' | 'UNCLEAR' | 'NOT_APPLICABLE';
    supportingText: string | null;
    origin: 'AI' | 'RULE';
  };
  applicableStandardIds: string[];
  applicableStandardDesignations: string[];
  regulatorySource: { name: string; url: string | null; authority: string; instrument: string };
  confidence: ConfidenceLevel;
  verificationNote: string;
  ruleVerificationStatus: VerificationStatus | null;
  specMentionsCertification: boolean;
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Specification gaps (Stage 8) — stored in analyses/{id}/gaps/{gapId}
// ---------------------------------------------------------------------------

export interface SpecificationGap {
  id: string;
  code: string;
  category: GapCategory;
  severity: GapSeverity;
  issue: string;
  whyItMatters: string;
  suggestion: string;
  quote: string | null;
  evidence: { statement: string; source: string | null; url: string | null } | null;
  relatedStandardIds: string[];
  origin: 'RULE' | 'AI';
  status: GapStatus;
  statusNote: string | null;
  updatedBy: string | null;
}

export interface ReadinessScore {
  score: number;
  label: 'PROCUREMENT_READY' | 'NEEDS_IMPROVEMENT' | 'INCOMPLETE';
  parameterCoverage: { covered: number; total: number };
  counts: { critical: number; warning: number; info: number };
  explanation: string;
}

// ---------------------------------------------------------------------------
// Evidence — stored in analyses/{id}/evidence/{evidenceId}
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  id: string;
  targetType: 'RECOMMENDATION' | 'VERSION' | 'CERTIFICATION' | 'GAP' | 'RELATIONSHIP';
  targetId: string;
  kind: EvidenceKind;
  statement: string;
  excerpt: string | null;
  source: { name: string; url: string | null; retrievedAt: string | null } | null;
  provenanceClass: ProvenanceClass;
  verificationStatus: VerificationStatus | null;
}

// ---------------------------------------------------------------------------
// Result document: analyses/{analysisId}/results/current
// ---------------------------------------------------------------------------

export interface Abstention {
  abstained: boolean;
  message: string | null;
  reasons: string[];
}

export interface PipelineTrace {
  pipelineVersion: string;
  aiMode: AiMode;
  model: string | null;
  promptVersions: Record<string, string>;
  aiCalls: { promptId: string; ok: boolean; latencyMs: number; error: string | null }[];
  stageDurationsMs: Partial<Record<PipelineStage, number>>;
  knowledgeBase: { standards: number; relationships: number; certificationRules: number; categories: number; loadedAt: string };
  candidateCount: number;
  warnings: string[];
}

export interface AnalysisResultDoc {
  analysisId: string;
  orgId: string;
  specification: StructuredSpecification;
  recommendations: StandardRecommendation[];
  versionFindings: VersionFinding[];
  certificationFindings: CertificationFinding[];
  readiness: ReadinessScore;
  abstention: Abstention;
  summary: AnalysisSummary;
  trace: PipelineTrace;
  createdAt: IsoString;
}

// ---------------------------------------------------------------------------
// Generated procurement specification — analyses/{id}/specifications/{specId}
// ---------------------------------------------------------------------------

export const SPEC_SECTION_KEYS = [
  'product_definition',
  'technical_requirements',
  'applicable_standards',
  'related_standards',
  'testing_requirements',
  'safety_requirements',
  'installation_requirements',
  'certification_considerations',
  'inspection_acceptance',
  'documentation_requirements',
] as const;
export type SpecSectionKey = (typeof SPEC_SECTION_KEYS)[number];

export const SPEC_SECTION_TITLES: Record<SpecSectionKey, string> = {
  product_definition: '1. Product definition',
  technical_requirements: '2. Technical requirements',
  applicable_standards: '3. Applicable Indian Standards',
  related_standards: '4. Related standards',
  testing_requirements: '5. Testing requirements',
  safety_requirements: '6. Safety requirements',
  installation_requirements: '7. Installation requirements',
  certification_considerations: '8. Certification considerations',
  inspection_acceptance: '9. Inspection and acceptance criteria',
  documentation_requirements: '10. Documentation requirements',
};

export const SPEC_ITEM_ORIGINS = ['SPECIFICATION_INPUT', 'KNOWLEDGE_BASE', 'DRAFTING_TEMPLATE', 'GAP_PLACEHOLDER', 'AI_DRAFT', 'HUMAN_EDIT'] as const;
export type SpecItemOrigin = (typeof SPEC_ITEM_ORIGINS)[number];

export const SPEC_ITEM_ORIGIN_LABELS: Record<SpecItemOrigin, string> = {
  SPECIFICATION_INPUT: 'From your input',
  KNOWLEDGE_BASE: 'From standards knowledge base',
  DRAFTING_TEMPLATE: 'FiiSpec drafting template',
  GAP_PLACEHOLDER: 'Placeholder — to be completed',
  AI_DRAFT: 'AI-drafted wording',
  HUMAN_EDIT: 'Edited by reviewer',
};

export interface SpecItem {
  text: string;
  origin: SpecItemOrigin;
  standardIds: string[];
}

export interface SpecSection {
  key: SpecSectionKey;
  title: string;
  items: SpecItem[];
}

export interface GeneratedSpecificationDoc {
  id: string;
  analysisId: string;
  orgId: string;
  version: number;
  status: SpecDocStatus;
  sections: SpecSection[];
  generation: {
    method: 'DETERMINISTIC' | 'AI_ASSISTED';
    promptVersion: string | null;
    aiRejectedReason: string | null;
  };
  createdBy: string;
  createdAt: IsoString;
  updatedAt: IsoString;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: IsoString | null;
  reviewNote: string | null;
}

// ---------------------------------------------------------------------------
// Review tasks — reviewTasks/{taskId}
// ---------------------------------------------------------------------------

export interface ReviewTaskDoc {
  id: string;
  orgId: string;
  analysisId: string;
  analysisTitle: string;
  reason: string;
  trigger: 'ABSTENTION' | 'LOW_CONFIDENCE' | 'MANUAL_REQUEST' | 'SPEC_APPROVAL';
  status: 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';
  requestedBy: string;
  requestedByName: string;
  assignedTo: string | null;
  assignedToName: string | null;
  decisionNote: string | null;
  decidedBy: string | null;
  createdAt: IsoString;
  updatedAt: IsoString;
}

// ---------------------------------------------------------------------------
// Audit log — auditLogs/{logId}
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'ORG_CREATED'
  | 'ORG_JOINED'
  | 'MEMBER_ROLE_CHANGED'
  | 'ANALYSIS_CREATED'
  | 'DOCUMENT_UPLOADED'
  | 'ANALYSIS_PROCESSING_STARTED'
  | 'ANALYSIS_COMPLETED'
  | 'ANALYSIS_REVIEW_REQUIRED'
  | 'ANALYSIS_FAILED'
  | 'ANALYSIS_RETRIED'
  | 'GAP_STATUS_CHANGED'
  | 'SPEC_GENERATED'
  | 'SPEC_EDITED'
  | 'SPEC_APPROVED'
  | 'REPORT_EXPORTED'
  | 'REVIEW_REQUESTED'
  | 'REVIEW_DECIDED'
  | 'FEEDBACK_SUBMITTED'
  | 'KB_RECORD_CREATED'
  | 'KB_RECORD_UPDATED'
  | 'KB_RECORD_LIFECYCLE_CHANGED'
  | 'KB_RECORD_VERIFIED'
  | 'INGESTION_STAGED'
  | 'INGESTION_PUBLISHED'
  | 'INGESTION_REJECTED'
  | 'BENCHMARK_RUN';

export interface AuditLogDoc {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  actorRole: string | null;
  orgId: string | null;
  analysisId: string | null;
  targetType: string;
  targetId: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  at: IsoString;
}
