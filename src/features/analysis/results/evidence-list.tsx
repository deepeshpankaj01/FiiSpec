import { ExternalLink } from 'lucide-react';
import type { EvidenceItem } from '@shared/analysis';
import { EVIDENCE_KIND_LABELS } from '@shared/constants';
import { ProvenanceBadge } from '@/components/fiispec/badges';

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No evidence found for this item.</p>;
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-lg border bg-white p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{EVIDENCE_KIND_LABELS[e.kind]}</span>
            <ProvenanceBadge value={e.provenanceClass} />
          </div>
          <p className="text-sm text-foreground">{e.statement}</p>
          {e.excerpt ? <p className="mt-1 border-l-2 border-saffron-100 pl-2 text-xs text-muted-foreground">{e.excerpt}</p> : null}
          {e.source ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Source:{' '}
              {e.source.url ? (
                <a href={e.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
                  {e.source.name} <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="font-medium text-foreground">{e.source.name}</span>
              )}
              {e.source.retrievedAt ? ` · retrieved ${e.source.retrievedAt}` : ''}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
