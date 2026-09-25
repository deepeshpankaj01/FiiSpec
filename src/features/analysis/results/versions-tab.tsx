'use client';

import { Bot, CheckCircle2, FileClock, Quote } from 'lucide-react';
import Link from 'next/link';
import type { AnalysisResultDoc, TimelineEntry, VersionFinding } from '@shared/analysis';
import { Chip, VersionBadge } from '@/components/fiispec/badges';
import { cn } from '@/lib/utils';

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return null;
  return (
    <ol className="mt-3 flex flex-wrap items-stretch gap-2" aria-label="Version timeline">
      {entries.map((e, i) => (
        <li key={`${e.designation}-${e.label}-${i}`} className="flex items-center gap-2">
          <div
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-xs',
              e.kind === 'CURRENT' && 'border-navy-900 bg-navy-50',
              e.kind === 'SUPERSEDED_BY' && 'border-success/30 bg-success-bg',
              e.kind === 'AMENDMENT' && 'border-dashed bg-warning-bg',
              e.status === 'SUPERSEDED' && e.kind !== 'SUPERSEDED_BY' && 'text-muted-foreground',
            )}
          >
            <p className="font-semibold text-foreground">{e.label}</p>
            <p className="text-muted-foreground">
              {e.designation}
              {e.date ? ` · ${e.date}` : ''}
            </p>
            {e.verified ? (
              <p className="mt-0.5 inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3" aria-hidden /> Verified
              </p>
            ) : null}
          </div>
          {i < entries.length - 1 ? <span className="text-muted-foreground" aria-hidden>→</span> : null}
        </li>
      ))}
    </ol>
  );
}

function FindingCard({ f }: { f: VersionFinding }) {
  return (
    <article className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {f.origin === 'INPUT_REFERENCE' ? (
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Quote className="size-3" aria-hidden /> Cited in your specification
            </p>
          ) : null}
          <h3 className="text-base font-semibold">
            {f.standardId ? (
              <Link href={`/standards/${f.standardId}`} className="hover:underline">
                {f.citedAs ?? f.designation}
              </Link>
            ) : (
              f.citedAs ?? f.designation
            )}
          </h3>
          {f.currentDesignation && f.citedAs ? <p className="text-sm text-muted-foreground">Indexed record: {f.currentDesignation}</p> : null}
        </div>
        <VersionBadge state={f.state} />
      </div>
      <p className="mt-2 text-sm text-foreground">{f.message}</p>
      {f.explanation ? (
        <p className="mt-2 flex gap-2 rounded-lg bg-saffron-50 p-2 text-sm text-foreground">
          <Bot className="mt-0.5 size-4 shrink-0 text-saffron-600" aria-label="AI-generated interpretation" />
          <span>
            {f.explanation} <span className="text-xs text-saffron-600">(AI-generated interpretation)</span>
          </span>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {f.publicationYear ? <span>Edition year: {f.publicationYear}</span> : null}
        <span>Amendments: {f.amendmentDataStatus === 'INDEXED' ? f.amendmentCount : 'not indexed'}</span>
        {f.supersededBy ? <span>Superseded by: {f.supersededBy}</span> : null}
      </div>
      <Timeline entries={f.timeline} />
    </article>
  );
}

export function VersionsTab({ result }: { result: AnalysisResultDoc }) {
  const cited = result.versionFindings.filter((f) => f.origin === 'INPUT_REFERENCE');
  const recs = result.versionFindings.filter((f) => f.origin === 'RECOMMENDATION');
  const verifiedCount = recs.filter((f) => f.state === 'CURRENT_VERIFIED').length;
  return (
    <div className="space-y-8">
      <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <FileClock className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
        <p>
          FiiSpec reports a version as <strong>current</strong> only when an administrator has verified the record against the official catalogue within the last 12 months. {verifiedCount} of {recs.length} recommended standards meet that bar; the rest show “Version requires verification”.
        </p>
      </div>
      <section aria-labelledby="ver-cited" className="space-y-3">
        <h2 id="ver-cited" className="text-base font-semibold">Standards cited in your specification</h2>
        {cited.length ? cited.map((f) => <FindingCard key={f.id} f={f} />) : <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">Your specification does not cite any standards. The recommended standards below should be cited with their current editions.</p>}
      </section>
      <section aria-labelledby="ver-recs" className="space-y-3">
        <h2 id="ver-recs" className="text-base font-semibold">Recommended standards</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {recs.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}
        </div>
      </section>
      {result.versionFindings.some((f) => f.explanationOrigin === 'AI') ? (
        <p className="text-xs text-muted-foreground">
          <Chip tone="saffron" icon={<Bot />}>AI</Chip> Explanations marked as AI-generated interpret the deterministic finding; they never change it.
        </p>
      ) : null}
    </div>
  );
}
