'use client';

import { AlertTriangle, Bot, Cpu, RefreshCw, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AnalysisDoc, AnalysisResultDoc } from '@shared/analysis';
import { INPUT_MODE_LABELS, REVIEW_STATUS_LABELS } from '@shared/constants';
import { AnalysisStatusBadge, Chip, PrototypeBadge } from '@/components/fiispec/badges';
import { PageSkeleton } from '@/components/layout/app-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/auth-provider';
import { api, friendlyError } from '@/lib/firebase/callables';
import { useDocument } from '@/lib/firebase/hooks';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ProgressTracker } from '../progress-tracker';
import { AuditTab } from './audit-tab';
import { CertificationTab } from './certification-tab';
import { EvidenceTab } from './evidence-tab';
import { ExportMenu } from './export-menu';
import { GapsTab } from './gaps-tab';
import { GraphTab } from './graph-tab';
import { OverviewTab } from './overview-tab';
import { RequestReviewDialog } from './request-review-dialog';
import { SpecificationTab } from './specification-tab';
import { StandardsTab } from './standards-tab';
import { VersionsTab } from './versions-tab';

export const RESULT_TABS = [
  { value: 'overview', label: 'Blueprint' },
  { value: 'standards', label: 'Standards' },
  { value: 'graph', label: 'Graph' },
  { value: 'versions', label: 'Versions' },
  { value: 'certification', label: 'Certification' },
  { value: 'gaps', label: 'Gaps' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'specification', label: 'Specification' },
  { value: 'audit', label: 'Audit trail' },
] as const;
export type ResultTab = (typeof RESULT_TABS)[number]['value'];

function Tile({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'warning' | 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <p className={cn('text-2xl font-semibold tabular-nums', tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-navy-900')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function FailedPanel({ analysis }: { analysis: AnalysisDoc }) {
  const [busy, setBusy] = useState(false);
  const error = analysis.error;
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-bg p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-danger" aria-hidden />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-danger">{error?.message ?? 'The analysis could not be completed.'}</h2>
          <p className="text-sm text-foreground">{error?.nextStep ?? 'Retry the analysis.'}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            {error?.retryable !== false ? (
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.retryAnalysis({ analysisId: analysis.id });
                    toast.success('Analysis restarted.');
                  } catch (e) {
                    toast.error(friendlyError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw aria-hidden /> Retry analysis
              </Button>
            ) : null}
            <Link href="/analysis/new" className={buttonVariants({ variant: 'outline' })}>
              Start a new analysis
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalysisView({ analysisId }: { analysisId: string }) {
  const { claims } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const analysis = useDocument<AnalysisDoc>(`analyses/${analysisId}`);
  const done = analysis.data?.status === 'COMPLETED' || analysis.data?.status === 'REVIEW_REQUIRED';
  const result = useDocument<AnalysisResultDoc>(done ? `analyses/${analysisId}/results/current` : null);
  const [rerunning, setRerunning] = useState(false);

  const tabParam = params.get('tab');
  const tab: ResultTab = RESULT_TABS.some((t) => t.value === tabParam) ? (tabParam as ResultTab) : 'overview';
  const setTab = (value: ResultTab) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (analysis.loading) return <PageSkeleton />;
  if (!analysis.data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8 text-center">
        <h1 className="text-xl font-semibold">Analysis not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{analysis.error ?? 'It may have been removed, or it belongs to a different organisation.'}</p>
        <Link href="/analyses" className={cn(buttonVariants(), 'mt-4')}>
          Back to analyses
        </Link>
      </div>
    );
  }

  const a = analysis.data;
  const r = result.data;
  const canRerun = done && claims.role !== null;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Analysis · {INPUT_MODE_LABELS[a.inputMode]}{a.isDemo ? ' · Demo case' : ''}</p>
          <h1 className="text-2xl font-semibold">{a.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {a.productName ? <span className="font-medium text-foreground">{a.productName}</span> : null}
            <span>· {formatDateTime(a.completedAt ?? a.createdAt)}</span>
            <span>· by {a.createdByName}</span>
            <AnalysisStatusBadge status={a.status} />
            {a.aiMode ? (
              <Chip tone={a.aiMode === 'AI_ASSISTED' ? 'saffron' : 'neutral'} icon={a.aiMode === 'AI_ASSISTED' ? <Bot /> : <Cpu />} title={a.aiMode === 'AI_ASSISTED' ? 'AI stages ran and their output was validated' : 'AI was not configured or unavailable; deterministic analysis only'}>
                {a.aiMode === 'AI_ASSISTED' ? 'AI-assisted' : 'Deterministic only'}
              </Chip>
            ) : null}
            {a.reviewStatus !== 'NONE' ? <Chip tone="warning" icon={<UserCheck />}>{REVIEW_STATUS_LABELS[a.reviewStatus]}</Chip> : null}
          </div>
        </div>
        {done ? (
          <div className="flex flex-wrap gap-2">
            <RequestReviewDialog analysisId={a.id} />
            <ExportMenu analysisId={a.id} />
            {canRerun ? (
              <Button
                variant="outline"
                disabled={rerunning}
                onClick={async () => {
                  setRerunning(true);
                  try {
                    await api.retryAnalysis({ analysisId: a.id });
                    toast.success('Re-running the analysis with the current knowledge base.');
                  } catch (e) {
                    toast.error(friendlyError(e));
                  } finally {
                    setRerunning(false);
                  }
                }}
              >
                <RefreshCw aria-hidden /> Re-run
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {a.status === 'FAILED' ? <FailedPanel analysis={a} /> : null}
      {a.status === 'AWAITING_UPLOAD' || a.status === 'QUEUED' || a.status === 'PROCESSING' ? <ProgressTracker analysis={a} /> : null}

      {done && !r ? <PageSkeleton /> : null}
      {done && r ? (
        <>
          {r.abstention.abstained ? (
            <div className="mb-5 rounded-2xl border border-warning/40 bg-warning-bg p-5" role="alert">
              <div className="flex items-start gap-3">
                <UserCheck className="mt-0.5 size-5 text-warning" aria-hidden />
                <div>
                  <h2 className="font-semibold text-warning">{r.abstention.message}</h2>
                  <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
                    {r.abstention.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-foreground">Manual verification has been requested. Any candidate standards below are unconfirmed and marked “Review required”.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Standards identified" value={r.summary.standardsIdentified} />
            <Tile label="High-confidence matches" value={r.summary.highConfidence} tone="success" />
            <Tile label="Review-required matches" value={r.summary.reviewRequired} tone={r.summary.reviewRequired ? 'warning' : 'default'} />
            <Tile label="Potential gaps" value={a.summary?.gaps ?? r.summary.gaps} tone={r.summary.criticalGaps ? 'danger' : 'default'} />
            <Tile label="Certification flags" value={r.summary.certificationFlags} />
            <button type="button" onClick={() => setTab('gaps')} className="rounded-xl border border-saffron-100 bg-saffron-50 px-4 py-3 text-left transition-colors hover:border-saffron-500">
              <p className="text-2xl font-semibold tabular-nums text-saffron-600">
                {a.summary?.readinessScore ?? r.readiness.score}
                <span className="text-sm font-medium text-saffron-600/70">/100</span>
              </p>
              <p className="text-xs text-saffron-600">Specification readiness</p>
            </button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as ResultTab)}>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList variant="line" className="h-10 w-max min-w-full justify-start gap-1 border-b">
                {RESULT_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="px-3">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="pt-4">
              <TabsContent value="overview">
                <OverviewTab analysis={a} result={r} onNavigate={setTab} />
              </TabsContent>
              <TabsContent value="standards">
                <StandardsTab analysisId={a.id} result={r} />
              </TabsContent>
              <TabsContent value="graph">{tab === 'graph' ? <GraphTab analysisId={a.id} /> : null}</TabsContent>
              <TabsContent value="versions">
                <VersionsTab result={r} />
              </TabsContent>
              <TabsContent value="certification">
                <CertificationTab analysisId={a.id} result={r} />
              </TabsContent>
              <TabsContent value="gaps">
                <GapsTab analysis={a} result={r} />
              </TabsContent>
              <TabsContent value="evidence">{tab === 'evidence' ? <EvidenceTab analysisId={a.id} result={r} /> : null}</TabsContent>
              <TabsContent value="specification">
                <SpecificationTab analysis={a} />
              </TabsContent>
              <TabsContent value="audit">{tab === 'audit' ? <AuditTab analysis={a} /> : null}</TabsContent>
            </div>
          </Tabs>
          <div className="mt-8 flex justify-center">
            <PrototypeBadge />
          </div>
        </>
      ) : null}
    </div>
  );
}
