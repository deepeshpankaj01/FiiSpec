/**
 * Structured logging (one JSON line per event, picked up by Vercel's log
 * drain). Never log specification text, document content, or personal data —
 * only identifiers, sizes, stages, durations and error codes.
 */

type Fields = Record<string, string | number | boolean | null | undefined>;

const write = (severity: 'INFO' | 'WARNING' | 'ERROR', event: string, fields: Fields) => {
  const line = JSON.stringify({ severity, event, ...fields, at: new Date().toISOString() });
  if (severity === 'ERROR') console.error(line);
  else if (severity === 'WARNING') console.warn(line);
  else console.log(line);
};

export const log = {
  info: (event: string, fields: Fields = {}) => write('INFO', event, fields),
  warn: (event: string, fields: Fields = {}) => write('WARNING', event, fields),
  error: (event: string, error: unknown, fields: Fields = {}) =>
    write('ERROR', event, {
      ...fields,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
};
