/**
 * Lightweight operational metrics: daily counters in opsMetrics/{YYYY-MM-DD}.
 * Only counts and durations — never document content.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { log } from './log';

export type MetricName =
  | 'analysesStarted'
  | 'analysesCompleted'
  | 'analysesReviewRequired'
  | 'analysesFailed'
  | 'aiRequests'
  | 'aiFailures'
  | 'documentsProcessed'
  | 'documentFailures'
  | 'specificationsGenerated'
  | 'reportsExported'
  | 'pipelineLatencyMsTotal'
  | 'aiLatencyMsTotal';

export async function incrementMetrics(values: Partial<Record<MetricName, number>>): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const update: Record<string, FieldValue | string> = { day };
  for (const [key, value] of Object.entries(values)) {
    if (value) update[key] = FieldValue.increment(value);
  }
  try {
    await db.collection('opsMetrics').doc(day).set(update, { merge: true });
  } catch (error) {
    // Metrics must never break a user-facing operation.
    log.error('metrics.write_failed', error);
  }
}
