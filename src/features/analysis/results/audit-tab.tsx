'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { History } from 'lucide-react';
import type { AnalysisDoc, AuditLogDoc } from '@shared/analysis';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { formatDateTime } from '@/lib/format';

const ACTION_LABELS: Partial<Record<AuditLogDoc['action'], string>> = {
  ANALYSIS_CREATED: 'Analysis created',
  DOCUMENT_UPLOADED: 'Document read',
  ANALYSIS_PROCESSING_STARTED: 'Processing started',
  ANALYSIS_COMPLETED: 'Analysis completed',
  ANALYSIS_REVIEW_REQUIRED: 'Sent for review',
  ANALYSIS_FAILED: 'Processing failed',
  ANALYSIS_RETRIED: 'Re-run requested',
  GAP_STATUS_CHANGED: 'Gap updated',
  SPEC_GENERATED: 'Specification generated',
  SPEC_EDITED: 'Specification edited',
  SPEC_APPROVED: 'Specification approved',
  REPORT_EXPORTED: 'Report exported',
  REVIEW_REQUESTED: 'Review requested',
  REVIEW_DECIDED: 'Review decision',
  FEEDBACK_SUBMITTED: 'Feedback submitted',
};

export function AuditTab({ analysis }: { analysis: AnalysisDoc }) {
  const { claims } = useAuth();
  const logs = useQuery<AuditLogDoc>(
    claims.orgId ? () => query(collection(getFirebase().db, 'auditLogs'), where('orgId', '==', claims.orgId), where('analysisId', '==', analysis.id), orderBy('at', 'desc'), limit(100)) : null,
    `audit-${analysis.id}-${claims.orgId}`,
  );
  if (logs.loading) return <Skeleton className="h-64" />;
  if (logs.error) return <p className="text-sm text-danger">{logs.error}</p>;
  if (!logs.data.length) return <p className="text-sm text-muted-foreground">No audit events yet.</p>;
  return (
    <section aria-labelledby="audit-title">
      <h2 id="audit-title" className="mb-3 flex items-center gap-2 text-base font-semibold">
        <History className="size-4 text-saffron-500" aria-hidden /> Audit trail
      </h2>
      <ol className="relative space-y-4 border-l pl-6">
        {logs.data.map((log) => (
          <li key={log.id} className="relative">
            <span className="absolute -left-[29px] top-1.5 size-3 rounded-full border-2 border-white bg-navy-900" aria-hidden />
            <p className="text-sm font-medium text-navy-900">{ACTION_LABELS[log.action] ?? log.action}</p>
            <p className="text-sm text-foreground">{log.summary}</p>
            <p className="text-xs text-muted-foreground">
              {log.actorName}
              {log.actorRole && log.actorRole !== 'SYSTEM' ? ` (${log.actorRole.toLowerCase().replace(/_/g, ' ')})` : ''} · {formatDateTime(log.at)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
