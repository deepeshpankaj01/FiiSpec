'use client';

import { BookOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SectorId } from '@shared/constants';
import { SECTOR_LABELS, SECTORS, STANDARD_KIND_LABELS, STANDARD_STATUS_LABELS } from '@shared/constants';
import { Chip, PrototypeBadge } from '@/components/fiispec/badges';
import { NativeSelect } from '@/components/fiispec/native-select';
import { PageHeader } from '@/components/layout/app-shell';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, friendlyError, type StandardSearchHit } from '@/lib/firebase/callables';

export default function StandardsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sector, setSector] = useState<SectorId | ''>('');
  const [result, setResult] = useState<{ key: string; hits: StandardSearchHit[]; error: string | null } | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const requestKey = `${debounced}|${sector}`;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    api.searchStandards({ query: debounced, sector: sector || undefined, limit: 40 }).then(
      (res) => {
        if (cancelled) return;
        setResult({ key: requestKey, hits: res.hits, error: null });
        setTotal(res.total);
      },
      (e) => !cancelled && setResult({ key: requestKey, hits: [], error: friendlyError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [debounced, sector, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const hits = current ? current.hits : null;
  const error = current?.error ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Explore standards"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Search the indexed dataset by standard number, title, product, sector or keyword. {total !== null ? `${total} standards indexed.` : ''} <PrototypeBadge />
          </span>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_240px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. IS 17017, earthing, submersible pump, cement" className="h-10 pl-9" aria-label="Search standards" />
        </div>
        <NativeSelect value={sector} onChange={(e) => setSector(e.target.value as SectorId | '')} aria-label="Filter by sector">
          <option value="">All sectors</option>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {SECTOR_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !hits ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : hits.length ? (
        <ul className="divide-y rounded-xl border bg-white" aria-live="polite">
          {hits.map((h) => (
            <li key={h.id}>
              <Link href={`/standards/${h.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-900">{h.designation}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{h.title}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Chip tone="neutral">{STANDARD_KIND_LABELS[h.kind as keyof typeof STANDARD_KIND_LABELS] ?? h.kind}</Chip>
                  <Chip tone={h.status === 'CURRENT' ? 'info' : 'danger'}>{STANDARD_STATUS_LABELS[h.status as keyof typeof STANDARD_STATUS_LABELS] ?? h.status}</Chip>
                  <Chip tone={h.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>{h.verificationStatus === 'VERIFIED' ? 'Verified' : 'Unverified'}</Chip>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-14 text-center">
          <BookOpen className="mb-3 size-8 text-navy-700" aria-hidden />
          <h2 className="font-semibold">No standards found</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">The indexed dataset is a curated subset. A standard not listed here may still exist — check the BIS catalogue.</p>
        </div>
      )}
    </div>
  );
}
