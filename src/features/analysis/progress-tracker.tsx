'use client';

import { CheckCircle2, Circle, CircleSlash, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AnalysisDoc } from '@shared/analysis';
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES } from '@shared/constants';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Stage progress rendered directly from the analysis document written by the backend — no simulated progress. */
export function ProgressTracker({ analysis }: { analysis: AnalysisDoc }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const started = new Date(analysis.createdAt).getTime();
  const elapsed = Math.max(0, Math.round((now - started) / 1000));
  const stale = now - new Date(analysis.updatedAt).getTime() > 9 * 60_000;
  const visible = PIPELINE_STAGES.filter((s) => analysis.stages[s]?.state !== 'SKIPPED');

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Analysing your specification</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {analysis.status === 'AWAITING_UPLOAD' ? 'Waiting for the document upload to finish…' : analysis.status === 'QUEUED' ? 'Queued — processing will start in a moment.' : `${PIPELINE_STAGE_LABELS[analysis.currentStage ?? 'UNDERSTANDING']}…`}
          </p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
      </div>
      <ol className="space-y-2" aria-label="Processing stages">
        {visible.map((stage) => {
          const p = analysis.stages[stage];
          const state = p?.state ?? 'PENDING';
          return (
            <li key={stage} className={cn('flex items-center gap-3 rounded-lg px-3 py-2', state === 'RUNNING' && 'bg-navy-50')}>
              {state === 'DONE' ? (
                <CheckCircle2 className="size-5 text-success" aria-hidden />
              ) : state === 'RUNNING' ? (
                <Loader2 className="size-5 animate-spin text-navy-700" aria-hidden />
              ) : state === 'FAILED' ? (
                <XCircle className="size-5 text-danger" aria-hidden />
              ) : state === 'SKIPPED' ? (
                <CircleSlash className="size-5 text-muted-foreground" aria-hidden />
              ) : (
                <Circle className="size-5 text-muted-foreground/50" aria-hidden />
              )}
              <span className={cn('flex-1 text-sm', state === 'PENDING' ? 'text-muted-foreground' : 'font-medium text-navy-900')}>
                {PIPELINE_STAGE_LABELS[stage]}
                <span className="sr-only"> — {state.toLowerCase()}</span>
              </span>
              {p?.durationMs !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(p.durationMs)}</span> : null}
            </li>
          );
        })}
      </ol>
      {stale ? (
        <p className="mt-4 rounded-lg bg-warning-bg p-3 text-sm text-warning" role="status">
          This is taking longer than expected. If nothing changes, the analysis will be marked as timed out and you can retry it.
        </p>
      ) : null}
    </div>
  );
}
