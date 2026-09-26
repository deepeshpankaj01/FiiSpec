/**
 * FiiSpec shared domain constants.
 * Imported by the Next.js app (src/) and the server API (server/src/).
 * Keep this file dependency-free.
 */

export const USER_ROLES = ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  PROCUREMENT_OFFICER: 'Procurement Officer',
  REVIEWER: 'Reviewer',
  ORGANIZATION_USER: 'Organization User',
};

/** Roles that may be assigned inside an organization (ADMIN is platform-level and granted out-of-band). */
export const ORG_ASSIGNABLE_ROLES = ['PROCUREMENT_OFFICER', 'REVIEWER', 'ORGANIZATION_USER'] as const;
export type OrgAssignableRole = (typeof ORG_ASSIGNABLE_ROLES)[number];

export const SECTORS = [
  'ELECTRICAL',
  'ELECTROTECHNICAL_EV',
  'MECHANICAL',
  'CIVIL_CONSTRUCTION',
  'AGRICULTURE',
  'RENEWABLE_ENERGY',
  'ELECTRONICS_IT',
  'GENERAL',
] as const;
export type SectorId = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<SectorId, string> = {
  ELECTRICAL: 'Electrical equipment',
  ELECTROTECHNICAL_EV: 'E-mobility & EV charging',
  MECHANICAL: 'Mechanical & pumps',
  CIVIL_CONSTRUCTION: 'Civil & construction materials',
  AGRICULTURE: 'Agricultural equipment',
  RENEWABLE_ENERGY: 'Renewable energy',
  ELECTRONICS_IT: 'Electronics & IT',
  GENERAL: 'General',
};

export const STANDARD_KINDS = [
  'PRODUCT',
  'SYSTEM',
  'COMPONENT',
  'TEST_METHOD',
  'CODE_OF_PRACTICE',
  'SAFETY',
  'TERMINOLOGY',
] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];

export const STANDARD_KIND_LABELS: Record<StandardKind, string> = {
  PRODUCT: 'Product standard',
  SYSTEM: 'System standard',
  COMPONENT: 'Component standard',
  TEST_METHOD: 'Test method',
  CODE_OF_PRACTICE: 'Code of practice',
  SAFETY: 'Safety standard',
  TERMINOLOGY: 'Terminology',
};

export const STANDARD_STATUSES = ['CURRENT', 'SUPERSEDED', 'WITHDRAWN', 'UNDER_REVISION', 'UNKNOWN'] as const;
export type StandardStatus = (typeof STANDARD_STATUSES)[number];

export const STANDARD_STATUS_LABELS: Record<StandardStatus, string> = {
  CURRENT: 'Listed as current',
  SUPERSEDED: 'Superseded',
  WITHDRAWN: 'Withdrawn',
  UNDER_REVISION: 'Under revision',
  UNKNOWN: 'Status unknown',
};

/** Where a knowledge-base record came from. */
export const DATA_ORIGINS = ['OFFICIAL_SOURCE', 'CURATED_PUBLIC_REFERENCE', 'DEMO_PLACEHOLDER'] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

export const DATA_ORIGIN_LABELS: Record<DataOrigin, string> = {
  OFFICIAL_SOURCE: 'Official source',
  CURATED_PUBLIC_REFERENCE: 'Curated from public reference',
  DEMO_PLACEHOLDER: 'Demo placeholder',
};

/** Whether a human has verified the record against the current official source. */
export const VERIFICATION_STATUSES = ['VERIFIED', 'UNVERIFIED', 'DISPUTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * The four information classes FiiSpec must always distinguish in the UI.
 * Every evidence item and recommendation carries exactly one.
 */
export const PROVENANCE_CLASSES = [
  'VERIFIED_OFFICIAL',
  'CURATED_BENCHMARK',
  'AI_INTERPRETATION',
  'HUMAN_REVIEW_REQUIRED',
] as const;
export type ProvenanceClass = (typeof PROVENANCE_CLASSES)[number];

export const PROVENANCE_LABELS: Record<ProvenanceClass, string> = {
  VERIFIED_OFFICIAL: 'Verified official information',
  CURATED_BENCHMARK: 'Curated benchmark data',
  AI_INTERPRETATION: 'AI-generated interpretation',
  HUMAN_REVIEW_REQUIRED: 'Human review required',
};

export const RELATIONSHIP_TYPES = [
  'NORMATIVE_REFERENCE',
  'RELATED_STANDARD',
  'TEST_METHOD',
  'SAFETY',
  'INSTALLATION',
  'TERMINOLOGY',
  'RELATED_PRODUCT',
  'SUPERSEDES',
  'AMENDED_BY',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Relationship types stored in the standardRelationships collection. SUPERSEDES/AMENDED_BY are derived from version data. */
export const CURATED_RELATIONSHIP_TYPES = [
  'NORMATIVE_REFERENCE',
  'RELATED_STANDARD',
  'TEST_METHOD',
  'SAFETY',
  'INSTALLATION',
  'TERMINOLOGY',
  'RELATED_PRODUCT',
] as const;
export type CuratedRelationshipType = (typeof CURATED_RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  NORMATIVE_REFERENCE: 'Normative reference',
  RELATED_STANDARD: 'Related standard',
  TEST_METHOD: 'Test method',
  SAFETY: 'Safety',
  INSTALLATION: 'Installation',
  TERMINOLOGY: 'Terminology',
  RELATED_PRODUCT: 'Related product',
  SUPERSEDES: 'Supersedes',
  AMENDED_BY: 'Amended by',
};

export const RELATIONSHIP_PROVENANCE_TYPES = [
  'STANDARD_REFERENCES_CLAUSE',
  'OFFICIAL_CATALOGUE',
  'CURATED_EXPERT',
  'VERSION_RECORD',
] as const;
export type RelationshipProvenanceType = (typeof RELATIONSHIP_PROVENANCE_TYPES)[number];

export const RELATIONSHIP_PROVENANCE_LABELS: Record<RelationshipProvenanceType, string> = {
  STANDARD_REFERENCES_CLAUSE: "Listed in the standard's normative references clause",
  OFFICIAL_CATALOGUE: 'Official catalogue / notification',
  CURATED_EXPERT: 'Curated domain relationship',
  VERSION_RECORD: 'Version / supersession record',
};

export const LIFECYCLE_STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'REVIEW_REQUIRED'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
  REVIEW_REQUIRED: 'Review required',
};

export const RELEVANCE_LABELS = ['HIGH_RELEVANCE', 'STRONG_MATCH', 'POSSIBLE_MATCH', 'NEEDS_REVIEW'] as const;
export type RelevanceLabel = (typeof RELEVANCE_LABELS)[number];

export const RELEVANCE_LABEL_TEXT: Record<RelevanceLabel, string> = {
  HIGH_RELEVANCE: 'High relevance',
  STRONG_MATCH: 'Strong match',
  POSSIBLE_MATCH: 'Possible match',
  NEEDS_REVIEW: 'Needs review',
};

export const ANALYSIS_STATUSES = [
  'AWAITING_UPLOAD',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'REVIEW_REQUIRED',
  'FAILED',
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  AWAITING_UPLOAD: 'Awaiting upload',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  REVIEW_REQUIRED: 'Review required',
  FAILED: 'Failed',
};

/** Pipeline stages, in order. The UI renders progress directly from the analysis document. */
export const PIPELINE_STAGES = [
  'UPLOADING',
  'READING_DOCUMENT',
  'UNDERSTANDING',
  'RETRIEVING',
  'RELATIONSHIPS',
  'VERSIONS',
  'CERTIFICATION',
  'GAPS',
  'REPORT',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  UPLOADING: 'Uploading',
  READING_DOCUMENT: 'Reading document',
  UNDERSTANDING: 'Understanding specification',
  RETRIEVING: 'Finding relevant standards',
  RELATIONSHIPS: 'Checking relationships',
  VERSIONS: 'Checking versions',
  CERTIFICATION: 'Checking certification context',
  GAPS: 'Finding specification gaps',
  REPORT: 'Preparing report',
};

export const STAGE_STATES = ['PENDING', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED'] as const;
export type StageState = (typeof STAGE_STATES)[number];

export const INPUT_MODES = ['DOCUMENT', 'SPECIFICATION', 'DESCRIPTION'] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const INPUT_MODE_LABELS: Record<InputMode, string> = {
  DOCUMENT: 'Uploaded document',
  SPECIFICATION: 'Pasted specification',
  DESCRIPTION: 'Product description',
};

export const VERSION_STATES = [
  'CURRENT_VERIFIED',
  'REQUIRES_VERIFICATION',
  'OUTDATED_EDITION',
  'SUPERSEDED',
  'WITHDRAWN',
  'NOT_INDEXED',
  'UNDATED_REFERENCE',
] as const;
export type VersionState = (typeof VERSION_STATES)[number];

export const VERSION_STATE_LABELS: Record<VersionState, string> = {
  CURRENT_VERIFIED: 'Current (verified)',
  REQUIRES_VERIFICATION: 'Version requires verification',
  OUTDATED_EDITION: 'Older edition referenced',
  SUPERSEDED: 'Superseded',
  WITHDRAWN: 'Withdrawn',
  NOT_INDEXED: 'Not in indexed dataset',
  UNDATED_REFERENCE: 'Undated reference',
};

export const CERTIFICATION_CLASSES = [
  'APPLICABLE',
  'POTENTIALLY_APPLICABLE',
  'MANUAL_VERIFICATION',
  'NOT_DETECTED',
] as const;
export type CertificationClass = (typeof CERTIFICATION_CLASSES)[number];

export const CERTIFICATION_CLASS_LABELS: Record<CertificationClass, string> = {
  APPLICABLE: 'Applicable',
  POTENTIALLY_APPLICABLE: 'Potentially applicable',
  MANUAL_VERIFICATION: 'Manual verification required',
  NOT_DETECTED: 'Not detected',
};

export const CERTIFICATION_SCHEMES = [
  'BIS_PRODUCT_CERTIFICATION',
  'BIS_COMPULSORY_REGISTRATION',
  'QUALITY_CONTROL_ORDER',
  'ENERGY_LABELLING',
  'REGULATORY_REQUIREMENT',
] as const;
export type CertificationScheme = (typeof CERTIFICATION_SCHEMES)[number];

export const CERTIFICATION_SCHEME_LABELS: Record<CertificationScheme, string> = {
  BIS_PRODUCT_CERTIFICATION: 'BIS Product Certification (ISI mark)',
  BIS_COMPULSORY_REGISTRATION: 'BIS Compulsory Registration Scheme',
  QUALITY_CONTROL_ORDER: 'Quality Control Order',
  ENERGY_LABELLING: 'Energy efficiency labelling',
  REGULATORY_REQUIREMENT: 'Regulatory / statutory requirement',
};

export const GAP_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const;
export type GapSeverity = (typeof GAP_SEVERITIES)[number];

export const GAP_SEVERITY_LABELS: Record<GapSeverity, string> = {
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  INFO: 'Informational',
};

export const GAP_CATEGORIES = [
  'MISSING_PARAMETER',
  'AMBIGUOUS_REQUIREMENT',
  'CONFLICTING_REQUIREMENT',
  'MISSING_TEST_REQUIREMENT',
  'MISSING_SAFETY_REQUIREMENT',
  'MISSING_INSTALLATION_REQUIREMENT',
  'MISSING_CERTIFICATION_REFERENCE',
  'OUTDATED_STANDARD_REFERENCE',
  'UNDEFINED_UNIT',
  'INCOMPLETE_ACCEPTANCE_CRITERIA',
] as const;
export type GapCategory = (typeof GAP_CATEGORIES)[number];

export const GAP_CATEGORY_LABELS: Record<GapCategory, string> = {
  MISSING_PARAMETER: 'Missing technical parameter',
  AMBIGUOUS_REQUIREMENT: 'Ambiguous requirement',
  CONFLICTING_REQUIREMENT: 'Conflicting requirement',
  MISSING_TEST_REQUIREMENT: 'Missing test requirement',
  MISSING_SAFETY_REQUIREMENT: 'Missing safety requirement',
  MISSING_INSTALLATION_REQUIREMENT: 'Missing installation requirement',
  MISSING_CERTIFICATION_REFERENCE: 'Missing certification reference',
  OUTDATED_STANDARD_REFERENCE: 'Outdated standard reference',
  UNDEFINED_UNIT: 'Undefined unit',
  INCOMPLETE_ACCEPTANCE_CRITERIA: 'Incomplete acceptance criteria',
};

export const GAP_STATUSES = ['OPEN', 'ACCEPTED', 'DISMISSED', 'RESOLVED'] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export const REVIEW_STATUSES = ['NONE', 'PENDING', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  NONE: 'Not requested',
  PENDING: 'Review pending',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};

export const SPEC_DOC_STATUSES = ['AI_DRAFT', 'HUMAN_REVIEWED'] as const;
export type SpecDocStatus = (typeof SPEC_DOC_STATUSES)[number];

export const SPEC_DOC_STATUS_LABELS: Record<SpecDocStatus, string> = {
  AI_DRAFT: 'Generated draft — not reviewed',
  HUMAN_REVIEWED: 'Human-reviewed specification',
};

export const EVIDENCE_KINDS = [
  'SCOPE_MATCH',
  'METADATA_MATCH',
  'RELATIONSHIP_PROVENANCE',
  'VERSION_RECORD',
  'CERTIFICATION_RULE',
  'INPUT_QUOTE',
  'AI_ASSESSMENT',
  'PARAMETER_TEMPLATE',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  SCOPE_MATCH: 'Scope match',
  METADATA_MATCH: 'Metadata match',
  RELATIONSHIP_PROVENANCE: 'Relationship provenance',
  VERSION_RECORD: 'Version record',
  CERTIFICATION_RULE: 'Certification rule',
  INPUT_QUOTE: 'Quoted from your specification',
  AI_ASSESSMENT: 'AI assessment',
  PARAMETER_TEMPLATE: 'Category parameter template',
};

export const AI_MODES = ['AI_ASSISTED', 'DETERMINISTIC_ONLY'] as const;
export type AiMode = (typeof AI_MODES)[number];

export const QUANTITY_KINDS = [
  'POWER',
  'APPARENT_POWER',
  'VOLTAGE',
  'CURRENT',
  'FREQUENCY',
  'PHASE',
  'IP_RATING',
  'IK_RATING',
  'TEMPERATURE',
  'HUMIDITY',
  'ALTITUDE',
  'LENGTH',
  'CROSS_SECTION',
  'FLOW_RATE',
  'HEAD',
  'PRESSURE',
  'SPEED',
  'EFFICIENCY_CLASS',
  'EFFICIENCY',
  'POWER_FACTOR',
  'MASS',
  'STRENGTH',
  'GRADE',
  'ENERGY',
  'CAPACITY_AH',
  'DURATION',
  'CONNECTOR',
  'COMMUNICATION_PROTOCOL',
  'CHARGING_MODE',
  'PROTECTION_DEVICE',
  'QUANTITY',
] as const;
export type QuantityKind = (typeof QUANTITY_KINDS)[number];

export const QUANTITY_KIND_LABELS: Record<QuantityKind, string> = {
  POWER: 'Power',
  APPARENT_POWER: 'Apparent power',
  VOLTAGE: 'Voltage',
  CURRENT: 'Current',
  FREQUENCY: 'Frequency',
  PHASE: 'Supply phase',
  IP_RATING: 'Ingress protection (IP)',
  IK_RATING: 'Impact protection (IK)',
  TEMPERATURE: 'Temperature',
  HUMIDITY: 'Humidity',
  ALTITUDE: 'Altitude',
  LENGTH: 'Length',
  CROSS_SECTION: 'Conductor cross-section',
  FLOW_RATE: 'Flow rate',
  HEAD: 'Head',
  PRESSURE: 'Pressure',
  SPEED: 'Speed',
  EFFICIENCY_CLASS: 'Efficiency class',
  EFFICIENCY: 'Efficiency',
  POWER_FACTOR: 'Power factor',
  MASS: 'Mass',
  STRENGTH: 'Strength',
  GRADE: 'Grade',
  ENERGY: 'Energy',
  CAPACITY_AH: 'Capacity',
  DURATION: 'Duration',
  CONNECTOR: 'Connector type',
  COMMUNICATION_PROTOCOL: 'Communication protocol',
  CHARGING_MODE: 'Charging mode',
  PROTECTION_DEVICE: 'Protection device',
  QUANTITY: 'Quantity',
};

export const SUPPORTED_UPLOAD_TYPES = {
  'application/pdf': { extension: 'pdf', label: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: 'docx', label: 'DOCX' },
} as const;
export type SupportedUploadType = keyof typeof SUPPORTED_UPLOAD_TYPES;

/** Upload size limit enforced by the client and the upload route (Vercel caps request bodies at 4.5 MB). */
export const MAX_UPLOAD_MB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
/** Maximum characters of specification text passed through the pipeline. */
export const MAX_SPEC_TEXT_CHARS = 120_000;
export const MIN_SPEC_TEXT_CHARS = 12;

export const SUPPORTED_INPUT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'hi-Latn', label: 'Hinglish (Hindi in Latin script)' },
] as const;

export const UI_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (interface translation planned)' },
] as const;

export const DISCLAIMER =
  'FiiSpec is a decision-support tool. Final procurement and regulatory decisions require appropriate human verification against current official requirements.';

export const ABSTENTION_MESSAGE = 'FiiSpec could not establish sufficient evidence for a reliable recommendation.';

export const PIPELINE_VERSION = '1.0.0';
