'use client';

import { ArrowDown, Bot, ChevronDown, Cpu } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AnalysisDoc, AnalysisResultDoc, StandardRecommendation } from '@shared/analysis';
import { CONFIDENCE_LABELS, PIPELINE_STAGE_LABELS, QUANTITY_KIND_LABELS, SECTOR_LABELS } from '@shared/constants';
import { Chip, ConfidenceBadge } from '@/components/fiispec/badges';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ResultTab } from './analysis-view';
import { RecommendationCard } from './recommendation-card';

function paramValue(p: AnalysisResultDoc['specification']['technicalParameters'][number]): string {
  if (p.textValue) return p.textValue;
  if (p.normalizedValue === null) return p.rawText;
  const range = p.normalizedValueMax !== null ? `${p.normalizedValue} to ${p.normalizedValueMax}` : String(p.normalizedValue);
  return `${range} ${p.normalizedUnit ?? ''}`.trim();
}

function SpecificationSummary({ result }: { result: AnalysisResultDoc }) {
  const s = result.specification;
  const rows: [string, ReactNode][] = [
    ['Product', s.productName],
    [
      'Category',
      s.productCategoryLabel ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          {s.productCategoryLabel} <ConfidenceBadge level={s.categoryConfidence} />
        </span>
      ) : (
        <span className="text-warning">Not established</span>
      ),
    ],
    ['Intended use', s.intendedUse ?? <span className="text-muted-foreground">Not stated</span>],
    ['Industry', s.industry ? SECTOR_LABELS[s.industry] : <span className="text-muted-foreground">Not determined</span>],
    ['Environment', s.environment.setting === 'UNSPECIFIED' ? <span className="text-muted-foreground">Not stated</span> : `${s.environment.setting.toLowerCase().replace('_', ' / ')}${s.environment.conditions.filter((c) => !/^(outdoor|indoor)s?$/i.test(c)).length ? ` — ${s.environment.conditions.filter((c) => !/^(outdoor|indoor)s?$/i.test(c)).join(', ')}` : ''}`],
    [
      'Input language',
      <span key="lang" className="inline-flex flex-wrap items-center gap-2">
        {s.language.detected === 'hi-Latn' ? 'Hinglish' : s.language.detected === 'hi' ? 'Hindi' : s.language.detected === 'en' ? 'English' : s.language.detected}
        {s.language.normalization === 'AI_NORMALIZED' ? <Chip tone="saffron" icon={<Bot />}>Normalised by AI</Chip> : null}
        {s.language.normalization === 'UNAVAILABLE' ? <Chip tone="warning">Normalisation unavailable</Chip> : null}
      </span>,
    ],
    ['Standards cited in input', s.referencedStandards.length ? s.referencedStandards.map((c) => c.citedAs).join(', ') : <span className="text-muted-foreground">None</span>],
  ];
  return (
    <section aria-labelledby="spec-summary" className="rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="spec-summary" className="text-sm font-semibold">Specification understanding</h2>
        <Chip tone={s.origin === 'AI_ASSISTED' ? 'saffron' : 'neutral'} icon={s.origin === 'AI_ASSISTED' ? <Bot /> : <Cpu />}>
          {s.origin === 'AI_ASSISTED' ? 'AI-assisted extraction' : 'Deterministic extraction'}
        </Chip>
      </div>
      <dl className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {s.language.detected !== 'en' && s.normalizedSummary ? (
        <p className="border-t px-4 py-3 text-sm">
          <span className="font-medium">Normalised requirement: </span>
          {s.normalizedSummary}
        </p>
      ) : null}
      <div className="border-t px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Technical parameters</h3>
        {s.technicalParameters.length ? (
          <ul className="flex flex-wrap gap-2">
            {s.technicalParameters.map((p) => (
              <li key={p.id} className="rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs" title={`Read from: “${p.rawText}”${p.note ? ` · ${p.note}` : ''}`}>
                <span className="text-muted-foreground">{p.label || QUANTITY_KIND_LABELS[p.kind]}: </span>
                <span className="font-semibold text-foreground">{paramValue(p)}</span>
                {p.origin === 'AI' ? <span className="ml-1 text-saffron-600">(AI)</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No measurable parameters were found in the input.</p>
        )}
      </div>
      {s.missingFields.length ? (
        <div className="border-t px-4 py-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not stated</h3>
          <p className="text-sm text-muted-foreground">{s.missingFields.join(' · ')}</p>
        </div>
      ) : null}
    </section>
  );
}

function BlueprintStep({ label, count, items, tone = 'default', onClick }: { label: string; count?: number; items: string[]; tone?: 'default' | 'primary' | 'saffron' | 'warning'; onClick?: () => void }) {
  return (
    <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-navy-700/40',
          tone === 'primary' && 'border-navy-900 bg-navy-900 text-white hover:border-navy-900',
          tone === 'saffron' && 'border-saffron-100 bg-saffron-50',
          tone === 'warning' && 'border-warning/30 bg-warning-bg',
          tone === 'default' && 'bg-white',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={cn('text-xs font-semibold uppercase tracking-wide', tone === 'primary' ? 'text-navy-100' : 'text-muted-foreground')}>{label}</span>
          {count !== undefined ? <span className={cn('text-xs font-semibold tabular-nums', tone === 'primary' ? 'text-white' : 'text-navy-900')}>{count}</span> : null}
        </span>
        <span className={cn('mt-0.5 block truncate text-sm', tone === 'primary' ? 'font-semibold text-white' : 'text-foreground')}>{items.length ? items.join(' · ') : '—'}</span>
      </button>
  );
}

function StandardsBlueprint({ analysis, result, onNavigate }: { analysis: AnalysisDoc; result: AnalysisResultDoc; onNavigate: (tab: ResultTab) => void }) {
  const recs = result.recommendations;
  const byType = (type: string) => recs.filter((r) => r.relationship?.type === type).map((r) => r.standardNumber);
  const primary = recs.filter((r) => r.tier === 'PRIMARY');
  const certs = result.certificationFindings.filter((c) => c.classification !== 'NOT_DETECTED');
  const versionsFlagged = result.versionFindings.filter((v) => v.state !== 'CURRENT_VERIFIED');
  const steps: { label: string; items: string[]; count?: number; tone?: 'default' | 'primary' | 'saffron' | 'warning'; tab: ResultTab }[] = [
    { label: 'Product', items: [result.specification.productName], tab: 'overview' },
    { label: 'Primary standard', items: primary.map((p) => p.designation), tone: primary.some((p) => p.reviewRequired) ? 'warning' : 'primary', tab: 'standards' },
    { label: 'Normative references', items: byType('NORMATIVE_REFERENCE'), count: byType('NORMATIVE_REFERENCE').length, tab: 'standards' },
    { label: 'Test methods', items: byType('TEST_METHOD'), count: byType('TEST_METHOD').length, tab: 'standards' },
    { label: 'Safety', items: byType('SAFETY'), count: byType('SAFETY').length, tab: 'standards' },
    { label: 'Installation', items: byType('INSTALLATION'), count: byType('INSTALLATION').length, tab: 'standards' },
    { label: 'Related standards', items: [...byType('RELATED_PRODUCT'), ...byType('RELATED_STANDARD'), ...byType('TERMINOLOGY')], count: byType('RELATED_PRODUCT').length + byType('RELATED_STANDARD').length + byType('TERMINOLOGY').length, tab: 'graph' },
    { label: 'Version / amendments', items: versionsFlagged.length ? [`${versionsFlagged.length} need attention or verification`] : ['All verified'], tone: versionsFlagged.length ? 'warning' : 'default', tab: 'versions' },
    { label: 'Certification', items: certs.map((c) => c.title), count: certs.length, tab: 'certification' },
    { label: 'Specification gaps', items: [`${analysis.summary?.gaps ?? result.summary.gaps} gaps · ${analysis.summary?.criticalGaps ?? result.summary.criticalGaps} critical`], tone: 'saffron', tab: 'gaps' },
    { label: 'Evidence', items: ['Evidence items for every finding'], tab: 'evidence' },
    { label: 'Final specification', items: [analysis.specStatus === 'HUMAN_REVIEWED' ? 'Human-reviewed specification' : analysis.specStatus === 'AI_DRAFT' ? 'Draft generated — review pending' : 'Not generated yet'], tab: 'specification' },
  ];
  return (
    <section aria-labelledby="blueprint-title" className="min-w-0 rounded-xl border bg-muted/30 p-4">
      <h2 id="blueprint-title" className="mb-1 text-sm font-semibold">Standards Blueprint</h2>
      <p className="mb-3 text-xs text-muted-foreground">Everything connected to this procurement, top to bottom. Select a step to open it.</p>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.label}>
            <BlueprintStep label={s.label} items={s.items} count={s.count} tone={s.tone} onClick={() => onNavigate(s.tab)} />
            {i < steps.length - 1 ? <ArrowDown className="mx-auto my-0.5 size-3.5 text-muted-foreground/60" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function TracePanel({ result }: { result: AnalysisResultDoc }) {
  const t = result.trace;
  return (
    <Collapsible className="rounded-xl border bg-white">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-semibold">How this analysis was produced</span>
          <span className="block text-xs text-muted-foreground">Pipeline trace, AI calls, prompt versions and knowledge-base snapshot</span>
        </span>
        <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4 border-t p-4 text-sm md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</h3>
          <dl className="space-y-1">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Pipeline version</dt><dd>{t.pipelineVersion}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Mode</dt><dd>{t.aiMode === 'AI_ASSISTED' ? `AI-assisted (${t.model})` : 'Deterministic only'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Candidates retrieved</dt><dd>{t.candidateCount}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Knowledge base</dt><dd>{t.knowledgeBase.standards} standards · {t.knowledgeBase.relationships} relationships · {t.knowledgeBase.certificationRules} rules</dd></div>
          </dl>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage durations</h3>
          <ul className="space-y-1">
            {Object.entries(t.stageDurationsMs).map(([stage, ms]) => (
              <li key={stage} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{PIPELINE_STAGE_LABELS[stage as keyof typeof PIPELINE_STAGE_LABELS]}</span>
                <span className="tabular-nums">{formatDuration(ms)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI calls</h3>
          {t.aiCalls.length ? (
            <ul className="space-y-1">
              {t.aiCalls.map((c, i) => (
                <li key={`${c.promptId}-${i}`} className="flex justify-between gap-2">
                  <span>
                    {c.promptId} <span className="text-muted-foreground">v{t.promptVersions[c.promptId] ?? '?'}</span>
                  </span>
                  <span className={c.ok ? 'text-success' : 'text-danger'}>{c.ok ? `ok · ${formatDuration(c.latencyMs)}` : c.error}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No AI calls were made — the analysis used deterministic extraction, lexical retrieval and rules.</p>
          )}
          {t.warnings.length ? (
            <>
              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Warnings</h3>
              <ul className="list-disc space-y-1 pl-4 text-warning">
                {t.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function OverviewTab({ analysis, result, onNavigate }: { analysis: AnalysisDoc; result: AnalysisResultDoc; onNavigate: (tab: ResultTab) => void }) {
  const primary: StandardRecommendation[] = result.recommendations.filter((r) => r.tier === 'PRIMARY');
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <SpecificationSummary result={result} />
        <section aria-labelledby="primary-title" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="primary-title" className="text-sm font-semibold">
              Primary recommendations
            </h2>
            <span className="text-xs text-muted-foreground">
              {primary.length ? `${CONFIDENCE_LABELS[primary[0]!.confidence]} for the top match` : ''}
            </span>
          </div>
          {primary.length ? (
            primary.map((rec, i) => <RecommendationCard key={rec.id} rec={rec} analysisId={analysis.id} defaultOpen={i === 0 && !rec.reviewRequired} />)
          ) : (
            <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No primary standard could be established with sufficient evidence.</div>
          )}
        </section>
        <TracePanel result={result} />
      </div>
      <StandardsBlueprint analysis={analysis} result={result} onNavigate={onNavigate} />
    </div>
  );
}
