'use client';

import { collection, getCountFromServer, limit, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ANALYSIS_STATUS_LABELS, ANALYSIS_STATUSES } from '@shared/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { getFirebase } from '@/lib/firebase/client';
import { useDocument, useQuery } from '@/lib/firebase/hooks';
import { formatDuration } from '@/lib/format';

interface OpsMetrics {
  id: string;
  day: string;
  analysesStarted?: number;
  analysesCompleted?: number;
  analysesReviewRequired?: number;
  analysesFailed?: number;
  aiRequests?: number;
  aiFailures?: number;
  documentsProcessed?: number;
  documentFailures?: number;
  specificationsGenerated?: number;
  reportsExported?: number;
  pipelineLatencyMsTotal?: number;
  aiLatencyMsTotal?: number;
}

export default function AdminHealthPage() {
  const metrics = useQuery<OpsMetrics>(() => query(collection(getFirebase().db, 'opsMetrics'), orderBy('day', 'desc'), limit(14)), 'ops-metrics');
  const prompts = useDocument<{ registry: { id: string; version: string; description: string; effort: string }[] }>('systemConfig/prompts');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    for (const s of ANALYSIS_STATUSES) {
      getCountFromServer(query(collection(getFirebase().db, 'analyses'), where('status', '==', s)))
        .then((snap) => setStatusCounts((prev) => ({ ...prev, [s]: snap.data().count })))
        .catch(() => undefined);
    }
  }, []);

  const totals = metrics.data.reduce(
    (acc, m) => ({
      finished: acc.finished + (m.analysesCompleted ?? 0) + (m.analysesReviewRequired ?? 0),
      failed: acc.failed + (m.analysesFailed ?? 0),
      ai: acc.ai + (m.aiRequests ?? 0),
      aiFail: acc.aiFail + (m.aiFailures ?? 0),
      latency: acc.latency + (m.pipelineLatencyMsTotal ?? 0),
      aiLatency: acc.aiLatency + (m.aiLatencyMsTotal ?? 0),
    }),
    { finished: 0, failed: 0, ai: 0, aiFail: 0, latency: 0, aiLatency: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System health</h1>
        <p className="text-sm text-muted-foreground">Operational counters recorded by Cloud Functions (last 14 days). Counts and durations only — no document content is logged.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Analyses finished', String(totals.finished)],
          ['Analyses failed', String(totals.failed)],
          ['Mean pipeline latency', totals.finished ? formatDuration(Math.round(totals.latency / totals.finished)) : '—'],
          ['AI request failure rate', totals.ai ? `${Math.round((totals.aiFail / totals.ai) * 100)}% of ${totals.ai}` : 'No AI requests'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-base font-semibold">Analyses by status (all organisations)</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {ANALYSIS_STATUSES.map((s) => (
            <div key={s} className="flex flex-col-reverse rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">{ANALYSIS_STATUS_LABELS[s]}</dt>
              <dd className="text-lg font-semibold">{statusCounts[s] ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-base font-semibold">Daily counters</h2>
        {metrics.loading ? <Skeleton className="mt-3 h-40" /> : metrics.data.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Daily operational counters</caption>
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {['Day', 'Started', 'Completed', 'Review', 'Failed', 'Docs', 'AI calls', 'AI failures', 'Specs', 'Exports'].map((h) => <th key={h} scope="col" className="py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {metrics.data.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 font-medium">{m.day}</td>
                    <td className="py-2">{m.analysesStarted ?? 0}</td>
                    <td className="py-2">{m.analysesCompleted ?? 0}</td>
                    <td className="py-2">{m.analysesReviewRequired ?? 0}</td>
                    <td className="py-2">{m.analysesFailed ?? 0}</td>
                    <td className="py-2">{m.documentsProcessed ?? 0}{m.documentFailures ? ` (${m.documentFailures} failed)` : ''}</td>
                    <td className="py-2">{m.aiRequests ?? 0}</td>
                    <td className="py-2">{m.aiFailures ?? 0}</td>
                    <td className="py-2">{m.specificationsGenerated ?? 0}</td>
                    <td className="py-2">{m.reportsExported ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No operations recorded yet.</p>}
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-base font-semibold">Prompt registry</h2>
        <p className="text-sm text-muted-foreground">Versioned prompts used by the AI stages. Every analysis trace records the versions used.</p>
        <ul className="mt-3 divide-y">
          {(prompts.data?.registry ?? []).map((p) => (
            <li key={p.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span><span className="font-medium">{p.id}</span> <span className="text-muted-foreground">v{p.version} · effort {p.effort}</span></span>
              <span className="text-xs text-muted-foreground">{p.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
