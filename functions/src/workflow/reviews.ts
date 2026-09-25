import { HttpsError, onCall } from 'firebase-functions/https';
import type { AnalysisDoc, ReviewTaskDoc } from '../../../shared/analysis';
import { RequestReviewSchema, SubmitFeedbackSchema, SubmitReviewSchema } from '../../../shared/api';
import type { ReviewStatus } from '../../../shared/constants';
import { db, nowIso } from '../lib/admin';
import { writeAudit } from '../lib/audit';
import { assertSameOrg, callerFrom, requirePermission } from '../lib/auth';
import { ENFORCE_APP_CHECK, FUNCTIONS_REGION } from '../lib/config';
import { parseRequest } from '../lib/errors';
import { enforceRateLimit } from '../lib/rateLimit';

const opts = { region: FUNCTIONS_REGION, enforceAppCheck: ENFORCE_APP_CHECK };

export const requestReview = onCall(opts, async (request) => {
  const caller = requirePermission(callerFrom(request), 'requestReview');
  const req = parseRequest(RequestReviewSchema, request.data);
  const analysisRef = db.collection('analyses').doc(req.analysisId);
  const analysis = (await analysisRef.get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);

  let assignedToName: string | null = null;
  if (req.assignedTo) {
    const member = (await db.collection('organizations').doc(caller.orgId).collection('members').doc(req.assignedTo).get()).data();
    if (!member) throw new HttpsError('not-found', 'Assignee is not a member of your organization.');
    if (!['REVIEWER', 'PROCUREMENT_OFFICER', 'ADMIN'].includes(member.role as string)) throw new HttpsError('failed-precondition', 'Assignee must be a reviewer or procurement officer.');
    assignedToName = member.displayName as string;
  }
  const ref = db.collection('reviewTasks').doc();
  const now = nowIso();
  const task: ReviewTaskDoc = {
    id: ref.id,
    orgId: caller.orgId,
    analysisId: req.analysisId,
    analysisTitle: analysis!.title,
    reason: req.reason,
    trigger: 'MANUAL_REQUEST',
    status: 'OPEN',
    requestedBy: caller.uid,
    requestedByName: caller.name,
    assignedTo: req.assignedTo ?? null,
    assignedToName,
    decisionNote: null,
    decidedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(task);
  await analysisRef.update({ reviewStatus: 'PENDING', updatedAt: now });
  await writeAudit({ action: 'REVIEW_REQUESTED', actorId: caller.uid, actorName: caller.name, actorRole: caller.role, orgId: caller.orgId, analysisId: req.analysisId, targetType: 'reviewTask', targetId: ref.id, summary: `Review requested${assignedToName ? ` from ${assignedToName}` : ''}: ${req.reason}` });
  return { taskId: ref.id };
});

export const submitReview = onCall(opts, async (request) => {
  const caller = requirePermission(callerFrom(request), 'decideReview');
  const req = parseRequest(SubmitReviewSchema, request.data);
  const taskRef = db.collection('reviewTasks').doc(req.taskId);
  const task = (await taskRef.get()).data() as ReviewTaskDoc | undefined;
  if (!task || task.orgId !== caller.orgId) throw new HttpsError('not-found', 'Review task not found.');
  if (task.status === 'APPROVED') throw new HttpsError('failed-precondition', 'This review is already approved.');
  if (req.decision === 'APPROVED' && task.requestedBy === caller.uid) {
    throw new HttpsError('permission-denied', 'A different member must approve a review you requested.');
  }
  const now = nowIso();
  await taskRef.update({
    status: req.decision,
    decisionNote: req.note ?? null,
    decidedBy: req.decision === 'IN_REVIEW' ? null : caller.name,
    assignedTo: task.assignedTo ?? caller.uid,
    assignedToName: task.assignedToName ?? caller.name,
    updatedAt: now,
  });
  const reviewStatus: ReviewStatus = req.decision === 'IN_REVIEW' ? 'IN_REVIEW' : req.decision;
  await db.collection('analyses').doc(task.analysisId).update({ reviewStatus, updatedAt: now });
  await writeAudit({
    action: 'REVIEW_DECIDED',
    actorId: caller.uid,
    actorName: caller.name,
    actorRole: caller.role,
    orgId: caller.orgId,
    analysisId: task.analysisId,
    targetType: 'reviewTask',
    targetId: req.taskId,
    summary: `Review ${req.decision.toLowerCase().replace('_', ' ')}${req.note ? `: ${req.note}` : ''}.`,
  });
  return { ok: true };
});

export const submitFeedback = onCall(opts, async (request) => {
  const caller = requirePermission(callerFrom(request), 'requestReview');
  const req = parseRequest(SubmitFeedbackSchema, request.data);
  await enforceRateLimit(caller.uid, 'submitFeedback');
  const analysis = (await db.collection('analyses').doc(req.analysisId).get()).data() as AnalysisDoc | undefined;
  assertSameOrg(caller, analysis?.orgId);
  const ref = db.collection('feedback').doc();
  await ref.set({
    id: ref.id,
    orgId: caller.orgId,
    analysisId: req.analysisId,
    analysisTitle: analysis!.title,
    userId: caller.uid,
    userName: caller.name,
    targetType: req.targetType,
    targetId: req.targetId,
    rating: req.rating,
    comment: req.comment ?? null,
    status: 'OPEN',
    createdAt: nowIso(),
  });
  await writeAudit({ action: 'FEEDBACK_SUBMITTED', actorId: caller.uid, actorName: caller.name, actorRole: caller.role, orgId: caller.orgId, analysisId: req.analysisId, targetType: req.targetType.toLowerCase(), targetId: req.targetId, summary: `Feedback: ${req.rating.toLowerCase().replace('_', ' ')}.` });
  return { ok: true };
});
