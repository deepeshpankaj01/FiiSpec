'use client';

import { ArrowRight, ChevronDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { StandardRecommendation } from '@shared/analysis';
import { CONFIDENCE_LABELS, RELATIONSHIP_LABELS, RELATIONSHIP_PROVENANCE_LABELS, STANDARD_KIND_LABELS } from '@shared/constants';
import { Chip, ConfidenceBadge, ProvenanceBadge, RelevanceMeter, VersionBadge } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EvidenceList } from './evidence-list';
import { FeedbackButtons } from './feedback-buttons';
import { useEvidence } from './use-analysis-data';

function ChainStep({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last ? <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden /> : null}
      <span className="relative mt-1 size-3.5 shrink-0 rounded-full border-2 border-saffron-500 bg-white" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </li>
  );
}

export function RecommendationCard({ rec, analysisId, defaultOpen = false }: { rec: StandardRecommendation; analysisId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const evidence = useEvidence(analysisId, open);
  const items = (evidence.items ?? []).filter((e) => rec.evidenceIds.includes(e.id));

  return (
    <article className={cn('rounded-xl border bg-white', rec.reviewRequired && 'border-warning/40')} aria-labelledby={`${rec.id}-title`}>
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Chip tone={rec.tier === 'PRIMARY' ? 'navy' : 'neutral'}>{rec.relationship ? RELATIONSHIP_LABELS[rec.relationship.type] : 'Primary standard'}</Chip>
              <span className="text-xs text-muted-foreground">{STANDARD_KIND_LABELS[rec.kind]}</span>
            </div>
            <h3 id={`${rec.id}-title`} className="text-base font-semibold">
              <Link href={`/standards/${rec.standardId}`} className="hover:underline">
                {rec.designation}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{rec.title}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <RelevanceMeter score={rec.score} label={rec.relevanceLabel} />
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <ConfidenceBadge level={rec.confidence} />
              <VersionBadge state={rec.versionState} />
            </div>
          </div>
        </div>

        <p className="mt-3 text-sm text-foreground">
          <span className="font-medium">Why: </span>
          {rec.reasons[0]}
        </p>
        {rec.reviewReasons.length ? <p className="mt-1 text-sm text-warning">Review required: {rec.reviewReasons.join(' ')}</p> : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`${rec.id}-evidence`}>
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden /> {open ? 'Hide evidence' : 'View evidence'}
          </Button>
          <FeedbackButtons analysisId={analysisId} targetType="RECOMMENDATION" targetId={rec.id} />
        </div>
      </div>

      {open ? (
        <div id={`${rec.id}-evidence`} className="grid gap-5 border-t bg-muted/30 p-4 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h4 className="mb-3 text-sm font-semibold">Evidence chain</h4>
            <ol>
              <ChainStep label="Recommendation">
                {rec.designation} — {rec.tier === 'PRIMARY' ? 'primary standard' : 'related standard'}
              </ChainStep>
              <ChainStep label="Reason">
                <ul className="list-disc space-y-0.5 pl-4">
                  {rec.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </ChainStep>
              <ChainStep label="Relationship">
                {rec.relationship ? (
                  <>
                    {RELATIONSHIP_LABELS[rec.relationship.type]} of {rec.relationship.fromDesignation}
                    <span className="block text-xs text-muted-foreground">{RELATIONSHIP_PROVENANCE_LABELS[rec.relationship.provenanceType]}</span>
                  </>
                ) : (
                  'Matched directly to the product (no intermediate relationship).'
                )}
              </ChainStep>
              <ChainStep label="Source">
                {rec.sourceUrl ? (
                  <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
                    {rec.sourceName} <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  rec.sourceName
                )}
                <span className="mt-1 block">
                  <ProvenanceBadge value={rec.provenanceClass} />
                </span>
              </ChainStep>
              <ChainStep label="Confidence">
                {CONFIDENCE_LABELS[rec.confidence]} · relevance score {rec.score}/100
                <span className="block text-xs text-muted-foreground">An explainable ranking signal, not a probability.</span>
              </ChainStep>
              <ChainStep label="Action" last>
                <span className="inline-flex items-center gap-1 font-medium">
                  <ArrowRight className="size-3.5 text-saffron-500" aria-hidden /> {rec.nextAction}
                </span>
              </ChainStep>
            </ol>

            <h4 className="mb-2 mt-5 text-sm font-semibold">Score breakdown</h4>
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Relevance score factors</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 font-medium">Factor</th>
                  <th scope="col" className="py-1 text-right font-medium">Value</th>
                  <th scope="col" className="py-1 text-right font-medium">Weight</th>
                  <th scope="col" className="py-1 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rec.factors
                  .filter((f) => f.weight > 0)
                  .map((f) => (
                    <tr key={f.key} title={f.explanation}>
                      <th scope="row" className="py-1.5 font-medium text-foreground">
                        {f.label}
                        <span className="block font-normal text-muted-foreground">{f.explanation}</span>
                      </th>
                      <td className="py-1.5 text-right tabular-nums">{f.value.toFixed(2)}</td>
                      <td className="py-1.5 text-right tabular-nums">{Math.round(f.weight * 100)}%</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{f.contribution.toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Evidence</h4>
            {evidence.error ? <p className="text-sm text-danger">{evidence.error}</p> : evidence.items ? <EvidenceList items={items} /> : <p className="text-sm text-muted-foreground">Loading evidence…</p>}
          </div>
        </div>
      ) : null}
    </article>
  );
}
