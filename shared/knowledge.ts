/**
 * Knowledge-base record schemas (standards, relationships, certification rules,
 * product categories, benchmark cases). These are validated at every boundary:
 * seed import, admin edits, ingestion publishing, and pipeline loading.
 */
import { z } from 'zod';
import {
  CERTIFICATION_CLASSES,
  CERTIFICATION_SCHEMES,
  CURATED_RELATIONSHIP_TYPES,
  DATA_ORIGINS,
  GAP_SEVERITIES,
  LIFECYCLE_STATES,
  QUANTITY_KINDS,
  RELATIONSHIP_PROVENANCE_TYPES,
  SECTORS,
  STANDARD_KINDS,
  STANDARD_STATUSES,
  VERIFICATION_STATUSES,
} from './constants';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Expected ISO date (YYYY-MM-DD)');
const slugId = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and hyphens');

export const SourceRefSchema = z.object({
  name: z.string().min(2).max(200),
  url: z.string().url().optional(),
  retrievedAt: isoDate.optional(),
  sourceType: z.enum(['BIS_CATALOGUE', 'BIS_PUBLIC_DOCUMENT', 'GAZETTE_NOTIFICATION', 'GOVERNMENT_PORTAL', 'SECONDARY', 'CURATED']),
  note: z.string().max(600).optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const VerificationSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  verifiedBy: z.string().optional(),
  verifiedAt: z.string().optional(),
  note: z.string().max(600).optional(),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const VersionEntrySchema = z.object({
  designation: z.string().min(2).max(120),
  year: z.number().int().min(1900).max(2100).optional(),
  label: z.string().max(120),
  status: z.enum(STANDARD_STATUSES),
  note: z.string().max(400).optional(),
  source: SourceRefSchema.optional(),
});
export type VersionEntry = z.infer<typeof VersionEntrySchema>;

export const AmendmentSchema = z.object({
  id: z.string().min(1).max(60),
  number: z.number().int().min(1).max(99),
  date: isoDate.optional(),
  summary: z.string().max(600),
  source: SourceRefSchema.optional(),
  verification: VerificationSchema,
});
export type Amendment = z.infer<typeof AmendmentSchema>;

export const StandardLinkSchema = z.object({
  standardId: slugId.optional(),
  designation: z.string().min(2).max(120),
  note: z.string().max(400).optional(),
});
export type StandardLink = z.infer<typeof StandardLinkSchema>;

export const StandardRecordSchema = z.object({
  id: slugId,
  /** Designation without year, e.g. "IS 17017 (Part 1)". Used for display and matching. */
  standardNumber: z.string().min(2).max(120),
  /** Base IS number, e.g. "17017". */
  baseNumber: z.string().regex(/^\d{1,6}$/),
  part: z.string().max(20).optional(),
  section: z.string().max(20).optional(),
  /** Prefix family: IS, IS/IEC, IS/ISO. */
  prefix: z.enum(['IS', 'IS/IEC', 'IS/ISO']),
  title: z.string().min(3).max(400),
  sector: z.enum(SECTORS),
  kind: z.enum(STANDARD_KINDS),
  /** Short curated paraphrase of scope. Never a verbatim copy of restricted text. */
  scope: z.string().min(10).max(1200),
  status: z.enum(STANDARD_STATUSES),
  edition: z.string().max(80).optional(),
  publicationYear: z.number().int().min(1900).max(2100).optional(),
  effectiveDate: isoDate.optional(),
  reviewDate: isoDate.optional(),
  adoptedFrom: z.string().max(120).optional(),
  supersedes: z.array(StandardLinkSchema).max(20),
  supersededBy: StandardLinkSchema.optional(),
  versionHistory: z.array(VersionEntrySchema).max(30),
  amendments: z.array(AmendmentSchema).max(40),
  /** Whether amendment data for this standard has actually been indexed. If NOT_INDEXED, amendment count is unknown. */
  amendmentDataStatus: z.enum(['INDEXED', 'NOT_INDEXED']),
  keywords: z.array(z.string().min(2).max(60)).max(60),
  productTypes: z.array(slugId).max(30),
  source: SourceRefSchema,
  evidenceReferences: z.array(SourceRefSchema).max(20),
  dataOrigin: z.enum(DATA_ORIGINS),
  verification: VerificationSchema,
  lifecycle: z.enum(LIFECYCLE_STATES),
});
export type StandardRecord = z.infer<typeof StandardRecordSchema>;

export const RelationshipRecordSchema = z.object({
  id: slugId,
  fromId: slugId,
  toId: slugId,
  type: z.enum(CURATED_RELATIONSHIP_TYPES),
  provenance: z.object({
    type: z.enum(RELATIONSHIP_PROVENANCE_TYPES),
    statement: z.string().min(10).max(600),
    source: SourceRefSchema.optional(),
  }),
  /** Optional condition under which this relationship matters (e.g. "outdoor installation"). */
  contextNote: z.string().max(300).optional(),
  verification: VerificationSchema,
  lifecycle: z.enum(LIFECYCLE_STATES),
});
export type RelationshipRecord = z.infer<typeof RelationshipRecordSchema>;

export const CertificationRuleSchema = z.object({
  id: slugId,
  title: z.string().min(3).max(200),
  scheme: z.enum(CERTIFICATION_SCHEMES),
  authority: z.string().min(2).max(200),
  /** Name of the legal instrument, order or scheme document. */
  instrument: z.string().min(3).max(300),
  /** Standards whose products this rule concerns. */
  standardIds: z.array(slugId).max(40),
  productCategories: z.array(slugId).max(30),
  /** Rule applies only if at least one of these terms appears (optional narrowing condition). */
  conditionTermsAny: z.array(z.string().min(2).max(60)).max(30),
  conditionDescription: z.string().max(600),
  /** Classification when the rule matches and the rule itself is verified. Unverified rules are capped at POTENTIALLY_APPLICABLE. */
  classificationWhenMatched: z.enum(CERTIFICATION_CLASSES),
  explanation: z.string().min(10).max(1000),
  source: SourceRefSchema,
  effectiveDate: isoDate.optional(),
  dataOrigin: z.enum(DATA_ORIGINS),
  verification: VerificationSchema,
  lifecycle: z.enum(LIFECYCLE_STATES),
});
export type CertificationRule = z.infer<typeof CertificationRuleSchema>;

export const ParameterRequirementSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(2).max(120),
  /** Parameter is satisfied if any extracted parameter has one of these kinds... */
  quantityKinds: z.array(z.enum(QUANTITY_KINDS)).max(6),
  /** ...or if any of these terms appears in the specification text. */
  termsAny: z.array(z.string().min(2).max(60)).max(20),
  severity: z.enum(GAP_SEVERITIES),
  /** Escalate to CRITICAL when the specification states outdoor installation (e.g. ingress protection). */
  criticalWhenOutdoor: z.boolean().default(false),
  whyItMatters: z.string().min(10).max(500),
  suggestion: z.string().min(10).max(500),
  relatedStandardIds: z.array(slugId).max(10),
});
export type ParameterRequirement = z.infer<typeof ParameterRequirementSchema>;

export const ProductCategorySchema = z.object({
  id: slugId,
  label: z.string().min(2).max(120),
  sector: z.enum(SECTORS),
  parentId: slugId.optional(),
  /** Technical names and trade synonyms used to recognise the product in a specification. */
  aliases: z.array(z.string().min(2).max(80)).min(1).max(40),
  description: z.string().min(10).max(600),
  /** True for products typically installed on site (triggers installation checks). */
  requiresInstallation: z.boolean(),
  parameterTemplate: z.array(ParameterRequirementSchema).max(30),
  templateSource: z.string().max(400),
  lifecycle: z.enum(LIFECYCLE_STATES),
});
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

export const BenchmarkCaseSchema = z.object({
  id: slugId,
  title: z.string().min(3).max(160),
  categoryId: slugId,
  language: z.enum(['en', 'hi', 'hi-Latn']),
  inputMode: z.enum(['SPECIFICATION', 'DESCRIPTION']),
  inputText: z.string().min(10).max(8000),
  /** Standards a correct analysis is expected to surface (primary or related). */
  expectedStandardIds: z.array(slugId).min(1).max(30),
  /** Expected primary standard ids (subset of expectedStandardIds). */
  expectedPrimaryIds: z.array(slugId).min(1).max(5),
  /** Gap codes a correct analysis is expected to raise (e.g. "MISSING_PARAMETER:ip_rating"). */
  expectedGapCodes: z.array(z.string().max(80)).max(30),
  /** Whether a correct system should abstain on this case. */
  expectAbstention: z.boolean(),
  notes: z.string().max(600),
  isDemo: z.boolean(),
  lifecycle: z.enum(LIFECYCLE_STATES),
});
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;

/** In-memory snapshot of the published knowledge base, as loaded by the pipeline. */
export interface KnowledgeBase {
  standards: StandardRecord[];
  relationships: RelationshipRecord[];
  certificationRules: CertificationRule[];
  categories: ProductCategory[];
  loadedAt: string;
}
