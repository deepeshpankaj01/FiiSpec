'use client';

import { Bot, ExternalLink, List, Network, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import type { GraphEdge, GraphNode, StandardsGraph } from '@shared/analysis';
import { RELATIONSHIP_PROVENANCE_LABELS, STANDARD_STATUS_LABELS } from '@shared/constants';
import { Chip, ConfidenceBadge } from '@/components/fiispec/badges';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EDGE_LABEL, GROUP_ORDER, GROUP_STYLE } from '@/features/graph/graph-model';
import { useDocument } from '@/lib/firebase/hooks';
import { cn } from '@/lib/utils';

const StandardsGraphCanvas = dynamic(() => import('@/features/graph/standards-graph-canvas'), {
  ssr: false,
  loading: () => <Skeleton className="h-[560px] w-full" />,
});

type Selection = { kind: 'node'; node: GraphNode } | { kind: 'edge'; edge: GraphEdge } | null;

function DetailPanel({ selection, graph, onClose }: { selection: Selection; graph: StandardsGraph; onClose: () => void }) {
  if (!selection) {
    return (
      <div className="rounded-xl border border-dashed bg-white p-5 text-sm text-muted-foreground">
        Select a <strong className="text-foreground">standard</strong> to see its details, or a <strong className="text-foreground">relationship</strong> to see why it exists and where that came from.
      </div>
    );
  }
  if (selection.kind === 'node') {
    const n = selection.node;
    const style = GROUP_STYLE[n.group];
    return (
      <div className="rounded-xl border bg-white p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: style.color }}>{style.label}</p>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details"><X /></Button>
        </div>
        <h3 className="text-base font-semibold">{n.label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{n.title}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {n.status ? <Chip tone={n.status === 'CURRENT' ? 'info' : 'danger'}>{STANDARD_STATUS_LABELS[n.status]}</Chip> : null}
          {n.confidence ? <ConfidenceBadge level={n.confidence} /> : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{graph.edges.filter((e) => e.source === n.id || e.target === n.id).length} connected relationship(s)</p>
        {n.standardId ? (
          <Link href={`/standards/${n.standardId}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}>
            Open standard
          </Link>
        ) : null}
      </div>
    );
  }
  const e = selection.edge;
  const from = graph.nodes.find((n) => n.id === e.source);
  const to = graph.nodes.find((n) => n.id === e.target);
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relationship · {EDGE_LABEL[e.type]}</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details"><X /></Button>
      </div>
      <h3 className="text-base font-semibold">
        {from?.label} <span className="text-muted-foreground">→</span> {to?.label}
      </h3>
      <p className="mt-2 text-sm text-foreground">{e.statement}</p>
      {e.contextNote ? <p className="mt-2 text-sm text-muted-foreground">{e.contextNote}</p> : null}
      {e.explanation && e.explanationOrigin === 'AI' ? (
        <p className="mt-3 flex gap-2 rounded-lg bg-saffron-50 p-2 text-sm">
          <Bot className="mt-0.5 size-4 shrink-0 text-saffron-600" aria-hidden />
          <span>
            {e.explanation} <span className="text-xs text-saffron-600">(AI-generated interpretation)</span>
          </span>
        </p>
      ) : null}
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Provenance</dt>
          <dd className="text-right">{e.provenanceType === 'FIISPEC_RANKING' ? 'FiiSpec ranking result' : RELATIONSHIP_PROVENANCE_LABELS[e.provenanceType]}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Verification</dt>
          <dd>{e.verificationStatus.toLowerCase()}</dd>
        </div>
      </dl>
      {e.source_ref?.url ? (
        <a href={e.source_ref.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
          {e.source_ref.name} <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

function GraphList({ graph, onSelect }: { graph: StandardsGraph; onSelect: (s: Selection) => void }) {
  return (
    <div className="space-y-4">
      {GROUP_ORDER.filter((g) => g !== 'PRODUCT').map((group) => {
        const nodes = graph.nodes.filter((n) => n.group === group);
        if (!nodes.length) return null;
        return (
          <section key={group} aria-labelledby={`graph-list-${group}`}>
            <h3 id={`graph-list-${group}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <span className="size-2.5 rounded-full" style={{ background: GROUP_STYLE[group].color }} aria-hidden /> {GROUP_STYLE[group].label}
            </h3>
            <ul className="divide-y rounded-xl border bg-white">
              {nodes.map((n) => {
                const incoming = graph.edges.find((e) => e.target === n.id);
                const parent = incoming ? graph.nodes.find((x) => x.id === incoming.source) : undefined;
                return (
                  <li key={n.id}>
                    <button type="button" className="w-full px-4 py-3 text-left hover:bg-muted/50" onClick={() => onSelect(incoming ? { kind: 'edge', edge: incoming } : { kind: 'node', node: n })}>
                      <p className="text-sm font-semibold text-navy-900">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.title}</p>
                      {parent && incoming ? <p className="mt-1 text-xs text-muted-foreground">{EDGE_LABEL[incoming.type]} of {parent.label}</p> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function GraphTab({ analysisId }: { analysisId: string }) {
  // Fetched only when this tab is opened — the graph is not loaded with the page.
  const graph = useDocument<StandardsGraph>(`analyses/${analysisId}/graph/current`);
  // This tab only renders in the browser (after data loads), so reading matchMedia in the initialiser is safe.
  const [view, setView] = useState<'graph' | 'list'>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'list' : 'graph'));
  const [selection, setSelection] = useState<Selection>(null);

  if (graph.loading) return <Skeleton className="h-[560px] w-full" />;
  if (!graph.data) return <p className="text-sm text-muted-foreground">{graph.error ?? 'No graph is available for this analysis.'}</p>;
  const g = graph.data;
  const usedGroups = GROUP_ORDER.filter((grp) => g.nodes.some((n) => n.group === grp));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-3 text-xs" aria-label="Legend">
          {usedGroups.map((grp) => (
            <li key={grp} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: GROUP_STYLE[grp].color }} aria-hidden /> {GROUP_STYLE[grp].label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="w-5 border-t-2 border-dashed border-muted-foreground" aria-hidden /> curated (verify)
          </li>
        </ul>
        <div className="inline-flex rounded-lg border bg-white p-0.5" role="group" aria-label="Graph view">
          <Button size="sm" variant={view === 'graph' ? 'default' : 'ghost'} onClick={() => setView('graph')} aria-pressed={view === 'graph'}>
            <Network aria-hidden /> Graph
          </Button>
          <Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} onClick={() => setView('list')} aria-pressed={view === 'list'}>
            <List aria-hidden /> List
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {view === 'graph' ? (
          <StandardsGraphCanvas
            graph={g}
            selectedId={selection?.kind === 'node' ? selection.node.id : null}
            onSelectNode={(node) => setSelection({ kind: 'node', node })}
            onSelectEdge={(edge) => setSelection({ kind: 'edge', edge })}
          />
        ) : (
          <GraphList graph={g} onSelect={setSelection} />
        )}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <DetailPanel selection={selection} graph={g} onClose={() => setSelection(null)} />
          {g.truncated ? <p className="mt-2 text-xs text-muted-foreground">The graph was truncated to keep it readable.</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">{g.nodes.length} nodes · {g.edges.length} relationships. Dashed edges are curated relationships pending verification.</p>
        </div>
      </div>
    </div>
  );
}
