'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { useState } from 'react';
import type { AuditLogDoc } from '@shared/analysis';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { formatDateTime } from '@/lib/format';

const ACTIONS: AuditLogDoc['action'][] = [
  'ANALYSIS_CREATED', 'ANALYSIS_COMPLETED', 'ANALYSIS_REVIEW_REQUIRED', 'ANALYSIS_FAILED', 'DOCUMENT_UPLOADED', 'SPEC_GENERATED', 'SPEC_APPROVED', 'REPORT_EXPORTED',
  'REVIEW_REQUESTED', 'REVIEW_DECIDED', 'GAP_STATUS_CHANGED', 'MEMBER_ROLE_CHANGED', 'ORG_CREATED', 'ORG_JOINED', 'KB_RECORD_CREATED', 'KB_RECORD_UPDATED',
  'KB_RECORD_LIFECYCLE_CHANGED', 'KB_RECORD_VERIFIED', 'INGESTION_STAGED', 'INGESTION_PUBLISHED', 'INGESTION_REJECTED', 'BENCHMARK_RUN', 'FEEDBACK_SUBMITTED',
];

export default function AdminAuditLogsPage() {
  const [action, setAction] = useState<AuditLogDoc['action'] | ''>('');
  const logs = useQuery<AuditLogDoc>(
    () => {
      const col = collection(getFirebase().db, 'auditLogs');
      return action ? query(col, where('action', '==', action), orderBy('at', 'desc'), limit(100)) : query(col, orderBy('at', 'desc'), limit(100));
    },
    `admin-audit-${action}`,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Audit logs</h1>
          <p className="text-sm text-muted-foreground">Append-only record of important actions. Clients cannot write or delete audit entries.</p>
        </div>
        <div className="w-64">
          <NativeSelect aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value as AuditLogDoc['action'] | '')}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.toLowerCase().replace(/_/g, ' ')}</option>)}
          </NativeSelect>
        </div>
      </div>
      {logs.loading ? <Skeleton className="h-96" /> : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Audit log entries</caption>
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">When</th>
                <th scope="col" className="px-4 py-2.5">Action</th>
                <th scope="col" className="px-4 py-2.5">Actor</th>
                <th scope="col" className="px-4 py-2.5">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDateTime(l.at)}</td>
                  <td className="px-4 py-2 text-xs font-medium">{l.action.toLowerCase().replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-xs">{l.actorName}<span className="block text-muted-foreground">{l.actorRole?.toLowerCase().replace(/_/g, ' ')}</span></td>
                  <td className="px-4 py-2">{l.summary}<span className="block text-xs text-muted-foreground">{l.targetType} · {l.targetId}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.data.length ? <p className="p-6 text-center text-sm text-muted-foreground">No audit entries.</p> : null}
        </div>
      )}
    </div>
  );
}
