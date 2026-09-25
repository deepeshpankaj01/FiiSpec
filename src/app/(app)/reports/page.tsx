'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { BadgeCheck, FileDown, FilePenLine } from 'lucide-react';
import Link from 'next/link';
import type { AnalysisDoc } from '@shared/analysis';
import { AnalysisStatusBadge, Chip } from '@/components/fiispec/badges';
import { PageHeader } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportMenu } from '@/features/analysis/results/export-menu';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { formatDate } from '@/lib/format';

export default function ReportsPage() {
  const { claims } = useAuth();
  const analyses = useQuery<AnalysisDoc>(
    claims.orgId ? () => query(collection(getFirebase().db, 'analyses'), where('orgId', '==', claims.orgId), where('status', 'in', ['COMPLETED', 'REVIEW_REQUIRED']), orderBy('createdAt', 'desc'), limit(50)) : null,
    `reports-${claims.orgId}`,
  );
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Reports" description="Export evidence-backed standards reports (PDF or DOCX) and track procurement specifications." />
      {analyses.loading ? (
        <Skeleton className="h-64" />
      ) : analyses.error ? (
        <p className="text-sm text-danger">{analyses.error}</p>
      ) : analyses.data.length ? (
        <ul className="divide-y rounded-xl border bg-white">
          {analyses.data.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/analysis/${a.id}?tab=specification`} className="text-sm font-semibold text-navy-900 hover:underline">
                  {a.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(a.completedAt ?? a.createdAt)}</span>
                  <AnalysisStatusBadge status={a.status} />
                  {a.specStatus === 'HUMAN_REVIEWED' ? (
                    <Chip tone="success" icon={<BadgeCheck />}>Human-reviewed specification</Chip>
                  ) : a.specStatus === 'AI_DRAFT' ? (
                    <Chip tone="warning" icon={<FilePenLine />}>Specification draft</Chip>
                  ) : (
                    <Chip tone="neutral">No specification yet</Chip>
                  )}
                </div>
              </div>
              <ExportMenu analysisId={a.id} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-14 text-center">
          <FileDown className="mb-3 size-8 text-navy-700" aria-hidden />
          <h2 className="font-semibold">No reports yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Completed analyses appear here for export.</p>
        </div>
      )}
    </div>
  );
}
