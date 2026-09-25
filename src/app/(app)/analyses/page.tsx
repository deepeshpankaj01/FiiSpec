'use client';

import { collection, type DocumentSnapshot, getDocs, limit, orderBy, query, type QueryConstraint, startAfter, where } from 'firebase/firestore';
import { FilePlus2, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AnalysisDoc } from '@shared/analysis';
import type { AnalysisStatus } from '@shared/constants';
import { ANALYSIS_STATUS_LABELS, ANALYSIS_STATUSES } from '@shared/constants';
import { NativeSelect } from '@/components/fiispec/native-select';
import { PageHeader } from '@/components/layout/app-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AnalysisList } from '@/features/analysis/analysis-list';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirebase } from '@/lib/firebase/client';
import { cn } from '@/lib/utils';

const PAGE = 20;

interface PageState {
  key: string;
  items: AnalysisDoc[];
  cursor: DocumentSnapshot | null;
  hasMore: boolean;
  error: string | null;
}

export default function AnalysesPage() {
  const { claims, user } = useAuth();
  const [status, setStatus] = useState<AnalysisStatus | ''>('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState<PageState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterKey = `${claims.orgId}|${status}|${mine}`;

  const fetchPage = useCallback(
    async (after: DocumentSnapshot | null) => {
      const constraints: QueryConstraint[] = [where('orgId', '==', claims.orgId)];
      if (status) constraints.push(where('status', '==', status));
      if (mine && user) constraints.push(where('createdBy', '==', user.uid));
      constraints.push(orderBy('createdAt', 'desc'), limit(PAGE));
      if (after) constraints.push(startAfter(after));
      const snap = await getDocs(query(collection(getFirebase().db, 'analyses'), ...constraints));
      return { docs: snap.docs.map((d) => ({ ...(d.data() as AnalysisDoc), id: d.id })), cursor: snap.docs.at(-1) ?? null, hasMore: snap.docs.length === PAGE };
    },
    [claims.orgId, user, status, mine],
  );

  // First page for the current filters; results are stored with the filter key they belong to.
  useEffect(() => {
    if (!claims.orgId || !user) return;
    let cancelled = false;
    fetchPage(null).then(
      (res) => !cancelled && setPage({ key: filterKey, items: res.docs, cursor: res.cursor, hasMore: res.hasMore, error: null }),
      () => !cancelled && setPage({ key: filterKey, items: [], cursor: null, hasMore: false, error: 'Analyses could not be loaded.' }),
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, filterKey, claims.orgId, user]);

  const current = page?.key === filterKey ? page : null;
  const items = current?.items ?? [];
  const loading = !current;
  const error = current?.error ?? null;
  const hasMore = current?.hasMore ?? false;

  const loadMore = async () => {
    if (!current?.cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(current.cursor);
      setPage({ ...current, items: [...current.items, ...res.docs], cursor: res.cursor, hasMore: res.hasMore });
    } catch {
      setPage({ ...current, error: 'More analyses could not be loaded.' });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Analyses"
        description="All analyses in your organisation. Results are private to organisation members."
        actions={
          <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'h-10')}>
            <FilePlus2 aria-hidden /> New Analysis
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label htmlFor="status-filter" className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <NativeSelect id="status-filter" value={status} onChange={(e) => setStatus(e.target.value as AnalysisStatus | '')}>
            <option value="">All statuses</option>
            {ANALYSIS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ANALYSIS_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="inline-flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-navy-900" /> Only my analyses
        </label>
      </div>
      <section className="rounded-xl border bg-white">
        {error ? (
          <p className="p-6 text-sm text-danger">{error}</p>
        ) : loading && !items.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : items.length ? (
          <AnalysisList analyses={items} />
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FolderOpen className="mb-3 size-8 text-navy-700" aria-hidden />
            <h2 className="font-semibold">No analyses {status || mine ? 'match these filters' : 'yet'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Start with a product requirement or upload a tender.</p>
          </div>
        )}
      </section>
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
