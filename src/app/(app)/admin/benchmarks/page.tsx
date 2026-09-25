'use client';

import { collection, limit, orderBy, query } from 'firebase/firestore';
import { FlaskConical, Info, Loader2, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { type BenchmarkCase, BenchmarkCaseSchema } from '@shared/knowledge';
import { Chip } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonRecordDialog } from '@/features/admin/json-record-dialog';
import { RecordActions } from '@/features/admin/record-actions';
import { api, type BenchmarkSummary, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { formatDateTime } from '@/lib/format';

interface CaseResult {
  caseId: string;
  title: string;
  primaryHit: boolean;
  standardRecall: number;
  standardPrecision: number;
  gapRecall: number | null;
  abstentionCorrect: boolean;
  missingExpected: string[];
  unexpected: string[];
  missingGapCodes: string[];
  durationMs: number;
}
interface BenchmarkRun {
  id: string;
  summary: BenchmarkSummary;
  results: CaseResult[];
  runBy: string;
  runAt: string;
  model: string | null;
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function AdminBenchmarksPage() {
  const cases = useQuery<BenchmarkCase & { lastRun?: { primaryHit: boolean } }>(() => query(collection(getFirebase().db, 'benchmarkCases')), 'admin-cases');
  const runs = useQuery<BenchmarkRun>(() => query(collection(getFirebase().db, 'benchmarkRuns'), orderBy('runAt', 'desc'), limit(10)), 'admin-runs');
  const [useAi, setUseAi] = useState(false);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState<BenchmarkCase | null>(null);
  const latest = runs.data[0];

  const run = async () => {
    setRunning(true);
    try {
      const res = await api.adminRunBenchmarks({ useAi });
      toast.success(`Benchmark complete: primary hit rate ${pct(res.summary.primaryHitRate)}.`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Benchmark cases</h1>
          <p className="text-sm text-muted-foreground">Runs the real pipeline on curated cases and measures agreement with hand-written expectations.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="size-4 accent-navy-900" /> Use AI (incurs model cost)
          </label>
          <Button onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />} {running ? 'Running…' : 'Run benchmark'}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 rounded-xl border bg-warning-bg p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <p>These metrics describe agreement with a small curated benchmark that was developed alongside the dataset and engine, so they are optimistic. They are not accuracy claims about real-world procurement or BIS coverage.</p>
      </div>

      {runs.loading ? (
        <Skeleton className="h-40" />
      ) : latest ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-base font-semibold">Latest run · {formatDateTime(latest.runAt)}</h2>
          <p className="text-xs text-muted-foreground">
            By {latest.runBy} · {latest.summary.aiMode === 'AI_ASSISTED' ? `AI-assisted (${latest.model})` : 'Deterministic only'} · {latest.summary.cases} cases
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Primary hit rate', latest.summary.primaryHitRate],
              ['Mean standard recall', latest.summary.meanStandardRecall],
              ['Mean standard precision', latest.summary.meanStandardPrecision],
              ['Mean gap recall', latest.summary.meanGapRecall],
              ['Abstention accuracy', latest.summary.abstentionAccuracy],
            ].map(([label, value]) => (
              <div key={label as string} className="flex flex-col-reverse rounded-lg bg-muted/60 p-3">
                <dt className="text-xs text-muted-foreground">{label as string}</dt>
                <dd className="text-xl font-semibold text-navy-900">{pct(value as number | null)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Per-case benchmark results</caption>
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2">Case</th>
                  <th scope="col" className="py-2">Primary</th>
                  <th scope="col" className="py-2">Recall</th>
                  <th scope="col" className="py-2">Precision</th>
                  <th scope="col" className="py-2">Gap recall</th>
                  <th scope="col" className="py-2">Missing / unexpected</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {latest.results.map((r) => (
                  <tr key={r.caseId}>
                    <td className="py-2 font-medium">{r.title}</td>
                    <td className="py-2"><Chip tone={r.primaryHit ? 'success' : 'danger'}>{r.primaryHit ? 'hit' : 'miss'}</Chip></td>
                    <td className="py-2 tabular-nums">{pct(r.standardRecall)}</td>
                    <td className="py-2 tabular-nums">{pct(r.standardPrecision)}</td>
                    <td className="py-2 tabular-nums">{pct(r.gapRecall)}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {r.missingExpected.length ? `missing: ${r.missingExpected.join(', ')}` : ''}
                      {r.unexpected.length ? ` unexpected: ${r.unexpected.join(', ')}` : ''}
                      {r.missingGapCodes.length ? ` gaps missed: ${r.missingGapCodes.join(', ')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No benchmark has been run yet. No metrics are shown until one is measured.</p>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold">Cases ({cases.data.length})</h2>
        <ul className="space-y-2">
          {cases.data.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <FlaskConical className="size-4 text-saffron-500" aria-hidden /> {c.title}
                  {c.isDemo ? <Chip tone="saffron">Demo</Chip> : null}
                  <Chip tone="neutral">{c.language}</Chip>
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">“{c.inputText.replace(/\n/g, ' ')}”</p>
                <p className="mt-1 text-xs text-muted-foreground">Expected primary: {c.expectedPrimaryIds.join(', ')}{c.expectAbstention ? ' · expects abstention' : ''}</p>
              </div>
              <RecordActions collection="benchmarkCases" id={c.id} lifecycle={c.lifecycle} verifiable={false} onEdit={() => setEditing(c)} />
            </li>
          ))}
        </ul>
      </section>
      <JsonRecordDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit benchmark case"
        description="Validated against the BenchmarkCase schema."
        schema={BenchmarkCaseSchema}
        initial={editing}
        onSave={async (record) => {
          await api.adminUpsertBenchmarkCase({ record });
        }}
      />
    </div>
  );
}
