'use client';

import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getFirebase } from '@/lib/firebase/client';
import { useDocument } from '@/lib/firebase/hooks';

const COUNTS = [
  { key: 'standards', label: 'Standards', href: '/admin/standards', build: () => collection(getFirebase().db, 'standards') },
  { key: 'relationships', label: 'Relationships', href: '/admin/relationships', build: () => collection(getFirebase().db, 'standardRelationships') },
  { key: 'rules', label: 'Certification rules', href: '/admin/certification-rules', build: () => collection(getFirebase().db, 'certificationRules') },
  { key: 'cases', label: 'Benchmark cases', href: '/admin/benchmarks', build: () => collection(getFirebase().db, 'benchmarkCases') },
  { key: 'verified', label: 'Verified standards', href: '/admin/standards', build: () => query(collection(getFirebase().db, 'standards'), where('verification.status', '==', 'VERIFIED')) },
  { key: 'analyses', label: 'Analyses (all organisations)', href: '/admin/health', build: () => collection(getFirebase().db, 'analyses') },
  { key: 'failed', label: 'Failed analyses', href: '/admin/reviews', build: () => query(collection(getFirebase().db, 'analyses'), where('status', '==', 'FAILED')) },
  { key: 'feedback', label: 'Open feedback', href: '/admin/reviews', build: () => query(collection(getFirebase().db, 'feedback'), where('status', '==', 'OPEN')) },
] as const;

export default function AdminOverviewPage() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const dataset = useDocument<{ name: string; version: string; notice: string; retrievedAt: string }>('systemConfig/dataset');
  const ai = useDocument<{ enabled: boolean; model: string | null }>('systemConfig/ai');

  useEffect(() => {
    for (const c of COUNTS) {
      getCountFromServer(c.build())
        .then((snap) => setCounts((prev) => ({ ...prev, [c.key]: snap.data().count })))
        .catch(() => setCounts((prev) => ({ ...prev, [c.key]: null })));
    }
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin overview</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COUNTS.map((c) => (
          <Link key={c.key} href={c.href} className="rounded-xl border bg-white p-4 hover:border-navy-700/40">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            {counts[c.key] === undefined ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-semibold text-navy-900">{counts[c.key] ?? '—'}</p>}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-base font-semibold">Knowledge base dataset</h2>
          {dataset.data ? (
            <>
              <p className="mt-1 text-sm">
                {dataset.data.name} · {dataset.data.version}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{dataset.data.notice}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No dataset metadata. Run the seed script or ingest records.</p>
          )}
          <p className="mt-3 text-sm">
            <Link href="/admin/ingestion" className="font-medium text-navy-700 hover:underline">Ingest authorised data →</Link>
          </p>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-base font-semibold">AI configuration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Remote configuration in <code className="rounded bg-muted px-1">systemConfig/ai</code>. The API key lives in Cloud Secret Manager and is never readable here.
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">AI stages enabled</dt><dd>{ai.data ? (ai.data.enabled ? 'Yes (when a key is configured)' : 'No') : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Model override</dt><dd>{ai.data?.model ?? 'Default (AI_MODEL parameter)'}</dd></div>
          </dl>
          <p className="mt-3 text-sm">
            <Link href="/admin/health" className="font-medium text-navy-700 hover:underline">View system health →</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
