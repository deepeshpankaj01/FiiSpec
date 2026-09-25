'use client';

import { collection, getAggregateFromServer, count, limit, orderBy, query, sum, where } from 'firebase/firestore';
import { ArrowRight, ClipboardCheck, FilePlus2, FileSearch, Layers, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AnalysisDoc } from '@shared/analysis';
import { PageHeader } from '@/components/layout/app-shell';
import { PrototypeBadge } from '@/components/fiispec/badges';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AnalysisList } from '@/features/analysis/analysis-list';
import { DemoCases } from '@/features/analysis/demo-cases';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { cn } from '@/lib/utils';

interface Stats {
  completed: number;
  standards: number;
  gaps: number;
  reviewsPending: number;
}

function useStats(orgId: string | null, refreshKey: number): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (!orgId) return;
    const { db } = getFirebase();
    const analyses = collection(db, 'analyses');
    let cancelled = false;
    Promise.all([
      getAggregateFromServer(query(analyses, where('orgId', '==', orgId), where('status', 'in', ['COMPLETED', 'REVIEW_REQUIRED'])), {
        completed: count(),
        standards: sum('summary.standardsIdentified'),
        gaps: sum('summary.gaps'),
      }),
      getAggregateFromServer(query(collection(db, 'reviewTasks'), where('orgId', '==', orgId), where('status', 'in', ['OPEN', 'IN_REVIEW'])), { pending: count() }),
    ])
      .then(([a, r]) => {
        if (cancelled) return;
        setStats({ completed: a.data().completed, standards: a.data().standards ?? 0, gaps: a.data().gaps ?? 0, reviewsPending: r.data().pending });
      })
      .catch(() => !cancelled && setStats({ completed: 0, standards: 0, gaps: 0, reviewsPending: 0 }));
    return () => {
      cancelled = true;
    };
  }, [orgId, refreshKey]);
  return stats;
}

function StatTile({ label, value, icon: Icon, hint }: { label: string; value: number | null; icon: typeof Layers; hint: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-saffron-500" aria-hidden />
      </div>
      {value === null ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-semibold text-navy-900">{value.toLocaleString('en-IN')}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { claims, profile } = useAuth();
  const orgId = claims.orgId;
  const recent = useQuery<AnalysisDoc>(
    orgId ? () => query(collection(getFirebase().db, 'analyses'), where('orgId', '==', orgId), orderBy('createdAt', 'desc'), limit(8)) : null,
    `recent-${orgId}`,
  );
  // Recompute aggregate stats whenever the recent list changes (e.g. an analysis completes).
  const refreshKey = recent.data.filter((a) => a.status === 'COMPLETED' || a.status === 'REVIEW_REQUIRED').length;
  const stats = useStats(orgId, refreshKey);
  const firstName = profile?.displayName?.split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={profile?.orgName ?? undefined}
        title={`Welcome${firstName ? `, ${firstName}` : ''}`}
        description={<span className="inline-flex flex-wrap items-center gap-2">Your organisation’s standards intelligence workspace. <PrototypeBadge /></span>}
        actions={
          <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'h-10 px-4')}>
            <FilePlus2 aria-hidden /> New Analysis
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Analyses completed" value={stats?.completed ?? null} icon={ListChecks} hint="Completed or sent for review" />
        <StatTile label="Standards identified" value={stats?.standards ?? null} icon={Layers} hint="Across completed analyses" />
        <StatTile label="Potential gaps found" value={stats?.gaps ?? null} icon={FileSearch} hint="Open specification gaps" />
        <StatTile label="Reviews pending" value={stats?.reviewsPending ?? null} icon={ClipboardCheck} hint="Open or in-review tasks" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="recent-title" className="rounded-xl border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 id="recent-title" className="text-sm font-semibold">Recent analyses</h2>
            <Link href="/analyses" className="inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
              View all <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {recent.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : recent.error ? (
            <p className="p-6 text-sm text-danger">{recent.error}</p>
          ) : recent.data.length ? (
            <AnalysisList analyses={recent.data} />
          ) : (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-900">
                <FileSearch className="size-6" aria-hidden />
              </span>
              <h3 className="text-base font-semibold">No analyses yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start with a product requirement or upload a tender.</p>
              <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'mt-4')}>
                <FilePlus2 aria-hidden /> Start an analysis
              </Link>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <DemoCases compact />
          <section className="rounded-xl border bg-white p-4 text-sm">
            <h2 className="font-semibold">How to read results</h2>
            <ul className="mt-2 space-y-1.5 text-muted-foreground">
              <li><span className="font-medium text-foreground">Confidence Score</span> — explainable ranking signal, not guaranteed accuracy.</li>
              <li><span className="font-medium text-foreground">Version requires verification</span> — the record has not been verified against the current BIS catalogue.</li>
              <li><span className="font-medium text-foreground">Review required</span> — FiiSpec abstained instead of guessing.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
