'use client';

import { collection, query, where } from 'firebase/firestore';
import { Bot, CheckCircle2, Quote, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AnalysisDoc, AnalysisResultDoc, SpecificationGap } from '@shared/analysis';
import type { GapSeverity, GapStatus } from '@shared/constants';
import { GAP_CATEGORY_LABELS, GAP_SEVERITY_LABELS } from '@shared/constants';
import { Chip, SeverityBadge } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-provider';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { cn } from '@/lib/utils';
import { FeedbackButtons } from './feedback-buttons';

const SEVERITY_ORDER: GapSeverity[] = ['CRITICAL', 'WARNING', 'INFO'];
const CAN_UPDATE = ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER'];

function ReadinessCard({ result }: { result: AnalysisResultDoc }) {
  const r = result.readiness;
  const pct = r.score;
  const color = pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger';
  const stroke = pct >= 80 ? '#2f855a' : pct >= 50 ? '#a8670f' : '#c53030';
  const circumference = 2 * Math.PI * 42;
  return (
    <section aria-labelledby="readiness-title" className="rounded-2xl border bg-white p-5">
      <h2 id="readiness-title" className="text-sm font-semibold">Specification Readiness</h2>
      <div className="mt-3 flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={`Readiness ${pct} out of 100`}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="#eef3fa" strokeWidth="10" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} />
        </svg>
        <div>
          <p className={cn('text-4xl font-semibold tabular-nums', color)}>
            {pct}
            <span className="text-lg text-muted-foreground">/100</span>
          </p>
          <p className="text-sm font-medium capitalize text-foreground">{r.label.replace(/_/g, ' ').toLowerCase()}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.parameterCoverage.covered}/{r.parameterCoverage.total} expected parameters stated
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{r.explanation}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {SEVERITY_ORDER.map((s) => (
          <div key={s} className="flex flex-col-reverse rounded-lg bg-muted/60 py-2">
            <dt className="text-xs text-muted-foreground">{GAP_SEVERITY_LABELS[s]}</dt>
            <dd className={cn('text-lg font-semibold tabular-nums', s === 'CRITICAL' ? 'text-danger' : s === 'WARNING' ? 'text-warning' : 'text-info')}>{r.counts[s === 'CRITICAL' ? 'critical' : s === 'WARNING' ? 'warning' : 'info']}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GapCard({ gap, analysisId, canUpdate }: { gap: SpecificationGap; analysisId: string; canUpdate: boolean }) {
  const [busy, setBusy] = useState(false);
  const setStatus = async (status: GapStatus) => {
    setBusy(true);
    try {
      await api.updateGapStatus({ analysisId, gapId: gap.id, status });
      toast.success(status === 'OPEN' ? 'Gap reopened.' : `Gap marked ${status.toLowerCase()}.`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const closed = gap.status === 'DISMISSED' || gap.status === 'RESOLVED';
  return (
    <article className={cn('rounded-xl border bg-white p-4', closed && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={gap.severity} />
        <span className="text-xs font-medium text-muted-foreground">{GAP_CATEGORY_LABELS[gap.category]}</span>
        {gap.origin === 'AI' ? <Chip tone="saffron" icon={<Bot />}>AI-identified (quote verified)</Chip> : null}
        {gap.status !== 'OPEN' ? <Chip tone={gap.status === 'RESOLVED' ? 'success' : gap.status === 'ACCEPTED' ? 'info' : 'neutral'}>{gap.status.toLowerCase()}</Chip> : null}
      </div>
      <h3 className="mt-2 text-base font-semibold">{gap.issue}</h3>
      {gap.quote ? (
        <blockquote className="mt-2 flex gap-2 rounded-lg border-l-2 border-saffron-500 bg-muted/40 px-3 py-2 text-sm text-foreground">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-saffron-500" aria-hidden />
          <span>{gap.quote}</span>
        </blockquote>
      ) : null}
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</p>
          <p className="text-foreground">{gap.whyItMatters}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested improvement</p>
          <p className="text-foreground">{gap.suggestion}</p>
        </div>
      </div>
      {gap.evidence ? (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Evidence: </span>
          {gap.evidence.statement}
          {gap.evidence.source ? ` — ${gap.evidence.source}` : ''}
        </p>
      ) : null}
      {gap.statusNote ? <p className="mt-2 text-xs text-muted-foreground">Note by {gap.updatedBy}: {gap.statusNote}</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {canUpdate ? (
          <div className="flex flex-wrap gap-2">
            {gap.status === 'OPEN' ? (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus('RESOLVED')}>
                  <CheckCircle2 aria-hidden /> Mark resolved
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setStatus('DISMISSED')}>
                  <XCircle aria-hidden /> Dismiss
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setStatus('OPEN')}>
                <RotateCcw aria-hidden /> Reopen
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Reviewers and procurement officers can resolve or dismiss gaps.</span>
        )}
        <FeedbackButtons analysisId={analysisId} targetType="GAP" targetId={gap.id} />
      </div>
    </article>
  );
}

export function GapsTab({ analysis, result }: { analysis: AnalysisDoc; result: AnalysisResultDoc }) {
  const { claims } = useAuth();
  const [severity, setSeverity] = useState<GapSeverity | 'ALL'>('ALL');
  const [showClosed, setShowClosed] = useState(false);
  const gaps = useQuery<SpecificationGap>(
    claims.orgId ? () => query(collection(getFirebase().db, 'analyses', analysis.id, 'gaps'), where('orgId', '==', claims.orgId)) : null,
    `gaps-${analysis.id}-${claims.orgId}`,
  );
  const visible = useMemo(
    () =>
      gaps.data
        .filter((g) => (severity === 'ALL' || g.severity === severity) && (showClosed || g.status === 'OPEN' || g.status === 'ACCEPTED'))
        .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
    [gaps.data, severity, showClosed],
  );
  const canUpdate = claims.role !== null && CAN_UPDATE.includes(claims.role);

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <ReadinessCard result={result} />
        <p className="px-1 text-xs text-muted-foreground">Every gap is justified by the product parameter template, a quote from your text, a version finding or a certification finding.</p>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter gaps">
          {(['ALL', ...SEVERITY_ORDER] as const).map((s) => (
            <Button key={s} size="sm" variant={severity === s ? 'default' : 'outline'} onClick={() => setSeverity(s)} aria-pressed={severity === s}>
              {s === 'ALL' ? 'All' : GAP_SEVERITY_LABELS[s]} ({s === 'ALL' ? gaps.data.filter((g) => showClosed || g.status === 'OPEN' || g.status === 'ACCEPTED').length : gaps.data.filter((g) => g.severity === s && (showClosed || g.status === 'OPEN' || g.status === 'ACCEPTED')).length})
            </Button>
          ))}
          <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="size-4 accent-navy-900" /> Show resolved and dismissed
          </label>
        </div>
        {gaps.loading ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />)
        ) : gaps.error ? (
          <p className="text-sm text-danger">{gaps.error}</p>
        ) : visible.length ? (
          visible.map((g) => <GapCard key={g.id} gap={g} analysisId={analysis.id} canUpdate={canUpdate} />)
        ) : (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 size-6 text-success" aria-hidden />
            <p className="font-medium">No specification gaps</p>
            <p className="text-sm text-muted-foreground">{gaps.data.length ? 'No gaps match the current filter.' : 'FiiSpec found nothing missing against the parameter template and checks.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
