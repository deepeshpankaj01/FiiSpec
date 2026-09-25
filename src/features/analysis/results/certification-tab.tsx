'use client';

import { ChevronDown, ExternalLink, Scale } from 'lucide-react';
import { useState } from 'react';
import type { AnalysisResultDoc, CertificationFinding } from '@shared/analysis';
import type { CertificationClass } from '@shared/constants';
import { CERTIFICATION_CLASS_LABELS, CERTIFICATION_SCHEME_LABELS } from '@shared/constants';
import { CertificationBadge, Chip, ConfidenceBadge } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EvidenceList } from './evidence-list';
import { FeedbackButtons } from './feedback-buttons';
import { useEvidence } from './use-analysis-data';

const ORDER: CertificationClass[] = ['APPLICABLE', 'POTENTIALLY_APPLICABLE', 'MANUAL_VERIFICATION', 'NOT_DETECTED'];

function FindingCard({ f, analysisId }: { f: CertificationFinding; analysisId: string }) {
  const [open, setOpen] = useState(false);
  const evidence = useEvidence(analysisId, open);
  return (
    <article className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CERTIFICATION_SCHEME_LABELS[f.scheme]}</p>
          <h3 className="text-base font-semibold">{f.title}</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CertificationBadge value={f.classification} />
          <ConfidenceBadge level={f.confidence} />
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-navy-900">{f.verificationNote}</p>
      <p className="mt-1 text-sm text-foreground">
        <span className="font-medium">Why: </span>
        {f.why}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Applicable standard</dt>
          <dd>{f.applicableStandardDesignations.length ? f.applicableStandardDesignations.join(', ') : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Regulatory source</dt>
          <dd>
            {f.regulatorySource.url ? (
              <a href={f.regulatorySource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
                {f.regulatorySource.instrument !== '—' ? f.regulatorySource.instrument : f.regulatorySource.name} <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              f.regulatorySource.instrument !== '—' ? f.regulatorySource.instrument : f.regulatorySource.name
            )}
            {f.regulatorySource.authority !== '—' ? <span className="block text-xs text-muted-foreground">{f.regulatorySource.authority}</span> : null}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {f.ruleVerificationStatus ? <Chip tone={f.ruleVerificationStatus === 'VERIFIED' ? 'success' : 'neutral'}>Rule {f.ruleVerificationStatus.toLowerCase()}</Chip> : null}
        {f.conditionAssessment.origin === 'AI' ? <Chip tone="saffron">Condition assessed by AI</Chip> : null}
        {f.specMentionsCertification ? <Chip tone="info">Mentioned in your specification</Chip> : null}
      </div>
      {f.evidenceIds.length ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden /> {open ? 'Hide evidence' : 'View evidence'}
          </Button>
          <FeedbackButtons analysisId={analysisId} targetType="CERTIFICATION" targetId={f.id} />
        </div>
      ) : null}
      {open ? <div className="mt-3">{evidence.items ? <EvidenceList items={evidence.items.filter((e) => f.evidenceIds.includes(e.id))} /> : <p className="text-sm text-muted-foreground">Loading evidence…</p>}</div> : null}
    </article>
  );
}

export function CertificationTab({ analysisId, result }: { analysisId: string; result: AnalysisResultDoc }) {
  const findings = result.certificationFindings;
  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <Scale className="mt-0.5 size-5 shrink-0 text-navy-700" aria-hidden />
        <p>
          Certification context comes from indexed rules (Quality Control Orders, Compulsory Registration, energy labelling, statutory regulations). FiiSpec does not make legal determinations: unverified rules are shown as “Potentially applicable — verify against current official requirement”, and “Not detected” never means “not required”.
        </p>
      </div>
      {ORDER.map((cls) => {
        const items = findings.filter((f) => f.classification === cls);
        if (!items.length) return null;
        return (
          <section key={cls} aria-labelledby={`cert-${cls}`} className="space-y-3">
            <h2 id={`cert-${cls}`} className="text-base font-semibold">
              {CERTIFICATION_CLASS_LABELS[cls]} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
            </h2>
            <div className={cn('grid gap-3', cls === 'NOT_DETECTED' && 'lg:grid-cols-2')}>
              {items.map((f) => (
                <FindingCard key={f.id} f={f} analysisId={analysisId} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
