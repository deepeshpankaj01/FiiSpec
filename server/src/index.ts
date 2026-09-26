/**
 * FiiSpec server API. Every callable validates auth, role, organisation and
 * payload server-side; they are served by POST /api/fn/{name}
 * (src/app/api/fn/[name]/route.ts). The analysis pipeline runs in the
 * background of the request that queues it.
 */
import {
  adminDecideIngestion,
  adminResolveFeedback,
  adminRunBenchmarks,
  adminSetLifecycle,
  adminStageIngestion,
  adminUpsertBenchmarkCase,
  adminUpsertCertificationRule,
  adminUpsertRelationship,
  adminUpsertStandard,
  adminVerifyRecord,
} from './admin';
import { createAnalysis } from './analysis/create';
import { retryAnalysis } from './analysis/retry';
import type { Callable } from './lib/runtime';
import { bootstrapProfile, createOrganization, joinOrganization, regenerateJoinCode, updateMemberRole, updateProfile } from './orgs';
import { exportReport } from './reports/export';
import { searchStandards } from './standards/search';
import { updateGapStatus } from './workflow/gaps';
import { requestReview, submitFeedback, submitReview } from './workflow/reviews';
import { approveSpecification, generateProcurementSpecification, saveSpecificationDraft } from './workflow/specification';

export const CALLABLES = {
  // Profile & organisations
  bootstrapProfile,
  updateProfile,
  createOrganization,
  joinOrganization,
  updateMemberRole,
  regenerateJoinCode,

  // Analysis lifecycle
  createAnalysis,
  retryAnalysis,

  // Workflow on results
  updateGapStatus,
  requestReview,
  submitReview,
  submitFeedback,
  generateProcurementSpecification,
  saveSpecificationDraft,
  approveSpecification,
  exportReport,

  // Standards
  searchStandards,

  // Administration
  adminUpsertStandard,
  adminUpsertRelationship,
  adminUpsertCertificationRule,
  adminUpsertBenchmarkCase,
  adminSetLifecycle,
  adminVerifyRecord,
  adminStageIngestion,
  adminDecideIngestion,
  adminRunBenchmarks,
  adminResolveFeedback,
} satisfies Record<string, Callable>;

export type CallableName = keyof typeof CALLABLES;
