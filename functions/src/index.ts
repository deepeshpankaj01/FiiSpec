/**
 * FiiSpec Cloud Functions entry point.
 * Callable functions validate auth, role, organisation and payload server-side;
 * triggers run the analysis pipeline asynchronously.
 */
import { setGlobalOptions } from 'firebase-functions';
import { FUNCTIONS_REGION } from './lib/config';

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 20 });

// Profile & organisations
export { bootstrapProfile, createOrganization, joinOrganization, regenerateJoinCode, updateMemberRole, updateProfile } from './orgs';

// Analysis lifecycle
export { createAnalysis } from './analysis/create';
export { onAnalysisJobCreated } from './analysis/jobs';
export { retryAnalysis, sweepStaleAnalyses } from './analysis/retry';
export { onInputDocumentUploaded } from './documents/onUpload';

// Workflow on results
export { updateGapStatus } from './workflow/gaps';
export { requestReview, submitFeedback, submitReview } from './workflow/reviews';
export { approveSpecification, generateProcurementSpecification, saveSpecificationDraft } from './workflow/specification';
export { exportReport } from './reports/export';

// Standards
export { searchStandards } from './standards/search';

// Administration
export {
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
