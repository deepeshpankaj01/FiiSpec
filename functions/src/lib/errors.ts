import { HttpsError } from 'firebase-functions/https';
import type { z } from 'zod';
import type { AnalysisError, AnalysisErrorCode } from '../../../shared/analysis';

/**
 * The Firebase callable protocol encodes `undefined` object fields as `null`.
 * No FiiSpec request uses `null` meaningfully, so null fields are treated as absent.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNulls(v)]));
  }
  return value;
}

/** Parse a callable payload with a Zod schema, returning a user-readable error on failure. */
export function parseRequest<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const parsed = schema.safeParse(stripNulls(data));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
    throw new HttpsError('invalid-argument', `${path}${first?.message ?? 'Invalid request'}`);
  }
  return parsed.data;
}

const USER_ERRORS: Record<AnalysisErrorCode, Omit<AnalysisError, 'code'>> = {
  UPLOAD_FAILED: {
    message: 'The document could not be uploaded.',
    nextStep: 'Check your connection and try uploading again.',
    retryable: true,
  },
  UPLOAD_EXPIRED: {
    message: 'The document upload was not completed in time.',
    nextStep: 'Start a new analysis and upload the document again.',
    retryable: false,
  },
  INVALID_FILE: {
    message: 'The file does not appear to be a valid PDF or DOCX document.',
    nextStep: 'Export the document again as PDF or DOCX, or paste the specification text instead.',
    retryable: false,
  },
  UNSUPPORTED_FORMAT: {
    message: 'This file format is not supported.',
    nextStep: 'Upload a PDF or DOCX file, or paste the specification text.',
    retryable: false,
  },
  EMPTY_DOCUMENT: {
    message: 'No readable text was found in the document. Scanned images are not yet supported.',
    nextStep: 'Upload a text-based PDF/DOCX, or paste the specification text.',
    retryable: false,
  },
  AI_UNAVAILABLE: {
    message: 'AI services were unavailable while processing this analysis.',
    nextStep: 'Retry the analysis. Deterministic checks still ran where possible.',
    retryable: true,
  },
  PROCESSING_TIMEOUT: {
    message: 'Processing took longer than expected and was stopped.',
    nextStep: 'Retry the analysis. Very large documents may need to be split.',
    retryable: true,
  },
  NO_RELEVANT_STANDARDS: {
    message: 'No relevant standards were found in the indexed dataset.',
    nextStep: 'Add more product detail or request a manual review.',
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: 'Something went wrong while processing this analysis.',
    nextStep: 'Retry the analysis. If it fails again, contact your administrator.',
    retryable: true,
  },
};

export function analysisError(code: AnalysisErrorCode): AnalysisError {
  return { code, ...USER_ERRORS[code] };
}

export class PipelineFailure extends Error {
  constructor(readonly code: AnalysisErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = 'PipelineFailure';
  }
}
