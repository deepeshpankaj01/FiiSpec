/**
 * Request schemas for callable Cloud Functions. The web app uses the same
 * schemas for form validation; functions re-validate every request server-side.
 */
import { z } from 'zod';
import {
  GAP_STATUSES,
  INPUT_MODES,
  LIFECYCLE_STATES,
  MAX_SPEC_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  MIN_SPEC_TEXT_CHARS,
  ORG_ASSIGNABLE_ROLES,
  SECTORS,
  SUPPORTED_UPLOAD_TYPES,
  VERIFICATION_STATUSES,
} from './constants';
import { SPEC_ITEM_ORIGINS, SPEC_SECTION_KEYS } from './analysis';
import {
  BenchmarkCaseSchema,
  CertificationRuleSchema,
  RelationshipRecordSchema,
  SourceRefSchema,
  StandardRecordSchema,
} from './knowledge';

const trimmed = (max: number) => z.string().trim().max(max);
const docId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier');

// --- Organizations ---------------------------------------------------------

export const CreateOrganizationSchema = z.object({
  name: trimmed(120).min(2, 'Organization name is required'),
  type: z.enum(['GOVERNMENT_DEPARTMENT', 'PSU', 'CONSULTANCY', 'MANUFACTURER', 'MSME', 'OTHER']),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationSchema>;

export const ORGANIZATION_TYPE_LABELS: Record<CreateOrganizationRequest['type'], string> = {
  GOVERNMENT_DEPARTMENT: 'Government department',
  PSU: 'Public sector undertaking',
  CONSULTANCY: 'Procurement consultancy',
  MANUFACTURER: 'Manufacturer',
  MSME: 'MSME',
  OTHER: 'Other',
};

export const JoinOrganizationSchema = z.object({
  joinCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Join codes look like ABCD-1234'),
});

export const UpdateMemberRoleSchema = z.object({
  userId: docId,
  role: z.enum(ORG_ASSIGNABLE_ROLES),
});

export const UpdateProfileSchema = z.object({
  displayName: trimmed(80).min(2, 'Enter your name'),
  language: z.enum(['en', 'hi']),
  notifications: z.object({
    analysisCompleted: z.boolean(),
    reviewAssigned: z.boolean(),
  }),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileSchema>;

// --- Analyses --------------------------------------------------------------

export const AnalysisFormSchema = z.object({
  product: trimmed(200).optional(),
  purpose: trimmed(1000).optional(),
  technicalSpecification: trimmed(MAX_SPEC_TEXT_CHARS).optional(),
  description: trimmed(4000).optional(),
  categoryHint: z.union([z.enum(SECTORS), z.literal('')]).optional(),
  procurementContext: trimmed(1000).optional(),
});

export const UploadDescriptorSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^/\\?%*:|"<>]+$/, 'File name contains unsupported characters'),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, `File exceeds the ${MAX_UPLOAD_MB} MB limit`),
  contentType: z.enum(Object.keys(SUPPORTED_UPLOAD_TYPES) as [keyof typeof SUPPORTED_UPLOAD_TYPES, ...(keyof typeof SUPPORTED_UPLOAD_TYPES)[]]),
});

export const CreateAnalysisSchema = z
  .object({
    mode: z.enum(INPUT_MODES),
    form: AnalysisFormSchema,
    file: UploadDescriptorSchema.optional(),
    benchmarkCaseId: z.string().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'DOCUMENT') {
      if (!value.file) ctx.addIssue({ code: 'custom', path: ['file'], message: 'Choose a PDF or DOCX file to upload' });
      return;
    }
    const text = value.mode === 'DESCRIPTION' ? value.form.description : value.form.technicalSpecification;
    if (!text || text.trim().length < MIN_SPEC_TEXT_CHARS) {
      ctx.addIssue({
        code: 'custom',
        path: ['form', value.mode === 'DESCRIPTION' ? 'description' : 'technicalSpecification'],
        message: 'Describe the requirement in at least a short sentence',
      });
    }
  });
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisSchema>;

export const AnalysisRefSchema = z.object({ analysisId: docId });

export const UpdateGapStatusSchema = z.object({
  analysisId: docId,
  gapId: docId,
  status: z.enum(GAP_STATUSES),
  note: trimmed(500).optional(),
});

export const SpecSectionInputSchema = z.object({
  key: z.enum(SPEC_SECTION_KEYS),
  items: z
    .array(
      z.object({
        text: trimmed(2000).min(1),
        origin: z.enum(SPEC_ITEM_ORIGINS),
        standardIds: z.array(z.string().max(80)).max(20),
      }),
    )
    .max(60),
});

export const SaveSpecificationSchema = z.object({
  analysisId: docId,
  specId: docId,
  sections: z.array(SpecSectionInputSchema).length(SPEC_SECTION_KEYS.length),
});

export const ApproveSpecificationSchema = z.object({
  analysisId: docId,
  specId: docId,
  note: trimmed(1000).optional(),
});

export const ExportReportSchema = z.object({
  analysisId: docId,
  format: z.enum(['PDF', 'DOCX']),
});

export const RequestReviewSchema = z.object({
  analysisId: docId,
  reason: trimmed(1000).min(5, 'Explain what should be reviewed'),
  assignedTo: docId.optional(),
});

export const SubmitReviewSchema = z.object({
  taskId: docId,
  decision: z.enum(['IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED']),
  note: trimmed(1000).optional(),
});

export const SubmitFeedbackSchema = z.object({
  analysisId: docId,
  targetType: z.enum(['RECOMMENDATION', 'GAP', 'CERTIFICATION', 'VERSION', 'SPECIFICATION']),
  targetId: z.string().min(1).max(128),
  rating: z.enum(['HELPFUL', 'NOT_HELPFUL', 'INCORRECT']),
  comment: trimmed(1000).optional(),
});

export const SearchStandardsSchema = z.object({
  query: trimmed(200),
  sector: z.enum(SECTORS).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

// --- Admin -----------------------------------------------------------------

export const KB_COLLECTIONS = ['standards', 'standardRelationships', 'certificationRules', 'benchmarkCases'] as const;
export type KbCollection = (typeof KB_COLLECTIONS)[number];

export const AdminUpsertStandardSchema = z.object({ record: StandardRecordSchema });
export const AdminUpsertRelationshipSchema = z.object({ record: RelationshipRecordSchema });
export const AdminUpsertCertificationRuleSchema = z.object({ record: CertificationRuleSchema });
export const AdminUpsertBenchmarkCaseSchema = z.object({ record: BenchmarkCaseSchema });

export const AdminSetLifecycleSchema = z.object({
  collection: z.enum(KB_COLLECTIONS),
  id: docId,
  lifecycle: z.enum(LIFECYCLE_STATES),
  reason: trimmed(500).min(3, 'A reason is required for the audit log'),
});

export const AdminVerifyRecordSchema = z.object({
  collection: z.enum(['standards', 'standardRelationships', 'certificationRules']),
  id: docId,
  status: z.enum(VERIFICATION_STATUSES),
  note: trimmed(600).min(3, 'Record how this was verified (source, date)'),
});

export const AdminStageIngestionSchema = z.object({
  source: SourceRefSchema,
  version: trimmed(60).min(1),
  recordType: z.enum(['standards', 'standardRelationships', 'certificationRules']),
  /** JSON array of records; validated per record server-side. */
  payload: z.string().min(2).max(500_000),
});

export const AdminIngestionDecisionSchema = z.object({
  ingestionId: docId,
  decision: z.enum(['PUBLISH', 'REJECT']),
  markVerified: z.boolean().default(false),
  note: trimmed(600).min(3, 'A note is required for the audit log'),
});

export const AdminRunBenchmarksSchema = z.object({
  caseIds: z.array(docId).max(50).optional(),
  /** AI-assisted benchmark runs call the model for every case and incur cost. */
  useAi: z.boolean().default(false),
});

export const AdminResolveFeedbackSchema = z.object({
  feedbackId: docId,
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
});
