'use client';

import { useMemo, useState } from 'react';
import type { AnalysisResultDoc, EvidenceItem } from '@shared/analysis';
import type { ProvenanceClass } from '@shared/constants';
import { PROVENANCE_CLASSES, PROVENANCE_LABELS } from '@shared/constants';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EvidenceList } from './evidence-list';
import { useEvidence } from './use-analysis-data';

const TARGET_LABELS: Record<EvidenceItem['targetType'], string> = {
  RECOMMENDATION: 'Recommendations',
  VERSION: 'Version findings',
  CERTIFICATION: 'Certification',
  GAP: 'Specification gaps',
  RELATIONSHIP: 'Relationships',
};

export function EvidenceTab({ analysisId, result }: { analysisId: string; result: AnalysisResultDoc }) {
  const { items, error } = useEvidence(analysisId, true);
  const [filter, setFilter] = useState<ProvenanceClass | 'ALL'>('ALL');
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of result.recommendations) map.set(r.id, `${r.designation} — ${r.title}`);
    for (const v of result.versionFindings) map.set(v.id, v.citedAs ?? v.designation);
    for (const c of result.certificationFindings) map.set(c.id, c.title);
    return map;
  }, [result]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!items) return <Skeleton className="h-64" />;
  const visible = items.filter((e) => filter === 'ALL' || e.provenanceClass === filter);
  const groups = (Object.keys(TARGET_LABELS) as EvidenceItem['targetType'][]).map((t) => ({ type: t, items: visible.filter((e) => e.targetType === t) })).filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by information class">
        <Button size="sm" variant={filter === 'ALL' ? 'default' : 'outline'} onClick={() => setFilter('ALL')} aria-pressed={filter === 'ALL'}>
          All ({items.length})
        </Button>
        {PROVENANCE_CLASSES.map((p) => (
          <Button key={p} size="sm" variant={filter === p ? 'default' : 'outline'} onClick={() => setFilter(p)} aria-pressed={filter === p}>
            {PROVENANCE_LABELS[p]} ({items.filter((e) => e.provenanceClass === p).length})
          </Button>
        ))}
      </div>
      {groups.length ? (
        groups.map((g) => {
          const byTarget = new Map<string, EvidenceItem[]>();
          for (const e of g.items) byTarget.set(e.targetId, [...(byTarget.get(e.targetId) ?? []), e]);
          return (
            <section key={g.type} aria-labelledby={`ev-${g.type}`} className="space-y-3">
              <h2 id={`ev-${g.type}`} className="text-base font-semibold">{TARGET_LABELS[g.type]}</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {[...byTarget.entries()].map(([targetId, list]) => (
                  <div key={targetId} className="rounded-xl border bg-muted/30 p-3">
                    <p className="mb-2 text-sm font-semibold text-navy-900">{titles.get(targetId) ?? targetId.replace(/^gap-/, 'Gap ')}</p>
                    <EvidenceList items={list} />
                  </div>
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">No evidence found for this filter.</p>
      )}
    </div>
  );
}
