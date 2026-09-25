/**
 * Structured logging. Never log specification text, document content, or
 * personal data — only identifiers, sizes, stages, durations and error codes.
 */
import * as logger from 'firebase-functions/logger';

type Fields = Record<string, string | number | boolean | null | undefined>;

export const log = {
  info: (event: string, fields: Fields = {}) => logger.info(event, { event, ...fields }),
  warn: (event: string, fields: Fields = {}) => logger.warn(event, { event, ...fields }),
  error: (event: string, error: unknown, fields: Fields = {}) =>
    logger.error(event, {
      event,
      ...fields,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
};
