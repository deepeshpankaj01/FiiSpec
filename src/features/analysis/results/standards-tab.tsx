'use client';

import type { AnalysisResultDoc } from '@shared/analysis';
import { RELATIONSHIP_LABELS } from '@shared/constants';
import { RecommendationCard } from './recommendation-card';

const GROUPS = ['NORMATIVE_REFERENCE', 'TEST_METHOD', 'SAFETY', 'INSTALLATION', 'RELATED_PRODUCT', 'RELATED_STANDARD', 'TERMINOLOGY'] as const;
const GROUP_HELP: Record<(typeof GROUPS)[number], string> = {
  NORMATIVE_REFERENCE: 'Standards the primary standard is read together with.',
  TEST_METHOD: 'How conformity is tested.',
  SAFETY: 'Protection and safety requirements.',
  INSTALLATION: 'Codes of practice for installation, relevant when installation is in scope.',
  RELATED_PRODUCT: 'Components and accessories specified separately.',
  RELATED_STANDARD: 'Related requirements that often belong in the specification.',
  TERMINOLOGY: 'Vocabulary standards defining the terms used.',
};

export function StandardsTab({ analysisId, result }: { analysisId: string; result: AnalysisResultDoc }) {
  const primary = result.recommendations.filter((r) => r.tier === 'PRIMARY');
  const related = result.recommendations.filter((r) => r.tier === 'RELATED');
  return (
    <div className="space-y-8">
      <section aria-labelledby="std-primary" className="space-y-3">
        <h2 id="std-primary" className="text-base font-semibold">Primary standards</h2>
        {primary.length ? primary.map((r) => <RecommendationCard key={r.id} rec={r} analysisId={analysisId} />) : <p className="text-sm text-muted-foreground">No primary standard could be established.</p>}
      </section>
      {GROUPS.map((type) => {
        const items = related.filter((r) => r.relationship?.type === type);
        if (!items.length) return null;
        return (
          <section key={type} aria-labelledby={`std-${type}`} className="space-y-3">
            <div>
              <h2 id={`std-${type}`} className="text-base font-semibold">
                {RELATIONSHIP_LABELS[type]} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
              </h2>
              <p className="text-sm text-muted-foreground">{GROUP_HELP[type]}</p>
            </div>
            {items.map((r) => (
              <RecommendationCard key={r.id} rec={r} analysisId={analysisId} />
            ))}
          </section>
        );
      })}
      {!related.length ? <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No related standards were identified.</p> : null}
    </div>
  );
}
