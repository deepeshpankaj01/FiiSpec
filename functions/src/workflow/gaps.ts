import { HttpsError, onCall } from 'firebase-functions/https';
import type { AnalysisDoc, AnalysisResultDoc, ReadinessScore, SpecificationGap } from '../../../shared/analysis';
import { UpdateGapStatusSchema } from '../../../shared/api';
import { readinessScore } from '../engine/gaps';
import { db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { assertSameOrg, callerFrom, requirePermission } from '../lib/auth';
import { ENFORCE_APP_CHECK, FUNCTIONS_REGION } from '../lib/config';
import { parseRequest } from '../lib/errors';

/**
 * Recompute readiness after reviewers act on gaps: resolved missing parameters
 * count as covered, dismissed ones are removed from the template total.
 */
export function recomputeReadiness(gaps: SpecificationGap[], original: ReadinessScore['parameterCoverage']): ReadinessScore {
  const missing = gaps.filter((g) => g.category === 'MISSING_PARAMETER');
  const resolved = missing.filter((g) => g.status === 'RESOLVED').length;
  const dismissed = missing.filter((g) => g.status === 'DISMISSED').length;
  const total = Math.max(0, original.total - dismissed);
  const covered = Math.min(total, original.covered + resolved);
  return readinessScore(gaps, covered, total, original.total > 0);
}

export const updateGapStatus = onCall({ region: FUNCTIONS_REGION, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const caller = requirePermission(callerFrom(request), 'updateGapStatus');
  const req = parseRequest(UpdateGapStatusSchema, request.data);
  const analysisRef = db.collection('analyses').doc(req.analysisId);
  const analysis = (await analysisRef.get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  const gapRef = analysisRef.collection('gaps').doc(req.gapId);
  const gap = (await gapRef.get()).data() as SpecificationGap | undefined;
  if (!gap) throw new HttpsError('not-found', 'Gap not found.');

  await gapRef.update({ status: req.status, statusNote: req.note ?? null, updatedBy: caller.name });

  const resultRef = analysisRef.collection('results').doc('current');
  const [gapsSnap, resultSnap] = await Promise.all([analysisRef.collection('gaps').get(), resultRef.get()]);
  const result = resultSnap.data() as AnalysisResultDoc | undefined;
  if (result) {
    const gaps = gapsSnap.docs.map((d) => d.data() as SpecificationGap);
    const readiness = recomputeReadiness(gaps, result.readiness.parameterCoverage);
    const openGaps = gaps.filter((g) => g.status === 'OPEN' || g.status === 'ACCEPTED');
    await resultRef.update({ readiness, 'summary.readinessScore': readiness.score });
    await analysisRef.update({
      'summary.readinessScore': readiness.score,
      'summary.gaps': openGaps.length,
      'summary.criticalGaps': openGaps.filter((g) => g.severity === 'CRITICAL').length,
      updatedAt: nowIso(),
    });
  }
  await writeAudit({
    action: 'GAP_STATUS_CHANGED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    analysisId: req.analysisId,
    targetType: 'gap',
    targetId: req.gapId,
    summary: `Gap "${gap.issue}" marked ${req.status.toLowerCase()}.`,
    metadata: { from: gap.status, to: req.status },
  });
  return { ok: true };
});
