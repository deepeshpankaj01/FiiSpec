import type { AuditAction, AuditLogDoc } from '../../../shared/analysis';
import { db, nowIso } from './admin';

export interface AuditInput {
  action: AuditAction;
  actorId: string;
  actorName: string;
  actorRole: string | null;
  orgId: string | null;
  analysisId?: string | null;
  targetType: string;
  targetId: string;
  summary: string;
  metadata?: AuditLogDoc['metadata'];
}

/** Append-only audit log. Clients can never write to auditLogs (see firestore.rules). */
export async function writeAudit(input: AuditInput): Promise<void> {
  const ref = db.collection('auditLogs').doc();
  const doc: AuditLogDoc = {
    id: ref.id,
    action: input.action,
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    orgId: input.orgId,
    analysisId: input.analysisId ?? null,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    metadata: input.metadata ?? {},
    at: nowIso(),
  };
  await ref.set(doc);
}

export const SYSTEM_ACTOR = { actorId: 'system', actorName: 'FiiSpec pipeline', actorRole: 'SYSTEM' } as const;
