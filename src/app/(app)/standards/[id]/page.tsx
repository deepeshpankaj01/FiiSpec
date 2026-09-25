'use client';

import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CertificationRule, RelationshipRecord, StandardRecord } from '@shared/knowledge';
import {
  CERTIFICATION_CLASS_LABELS,
  CERTIFICATION_SCHEME_LABELS,
  DATA_ORIGIN_LABELS,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_PROVENANCE_LABELS,
  SECTOR_LABELS,
  STANDARD_KIND_LABELS,
  STANDARD_STATUS_LABELS,
} from '@shared/constants';
import { Chip } from '@/components/fiispec/badges';
import { PageSkeleton } from '@/components/layout/app-shell';
import { getFirebase } from '@/lib/firebase/client';
import { useDocument, useQuery } from '@/lib/firebase/hooks';

function designation(s: Pick<StandardRecord, 'standardNumber' | 'publicationYear'>): string {
  return s.publicationYear ? `${s.standardNumber} : ${s.publicationYear}` : s.standardNumber;
}

function useStandardNames(ids: string[]): Map<string, StandardRecord> {
  const [map, setMap] = useState(new Map<string, StandardRecord>());
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    Promise.all(key.split(',').map((id) => getDoc(doc(getFirebase().db, 'standards', id)).catch(() => null))).then((snaps) => {
      if (cancelled) return;
      const next = new Map<string, StandardRecord>();
      for (const s of snaps) if (s?.exists()) next.set(s.id, { ...(s.data() as StandardRecord), id: s.id });
      setMap(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return map;
}

export default function StandardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const standard = useDocument<StandardRecord>(`standards/${id}`);
  const db = typeof window !== 'undefined' ? getFirebase().db : null;
  const outgoing = useQuery<RelationshipRecord>(db ? () => query(collection(db, 'standardRelationships'), where('fromId', '==', id), where('lifecycle', '==', 'PUBLISHED')) : null, `out-${id}`);
  const incoming = useQuery<RelationshipRecord>(db ? () => query(collection(db, 'standardRelationships'), where('toId', '==', id), where('lifecycle', '==', 'PUBLISHED')) : null, `in-${id}`);
  const rules = useQuery<CertificationRule>(db ? () => query(collection(db, 'certificationRules'), where('standardIds', 'array-contains', id), where('lifecycle', '==', 'PUBLISHED')) : null, `rules-${id}`);
  const names = useStandardNames([...outgoing.data.map((r) => r.toId), ...incoming.data.map((r) => r.fromId), standard.data?.supersededBy?.standardId ?? ''].filter(Boolean));

  if (standard.loading) return <PageSkeleton />;
  const s = standard.data;
  if (!s) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8 text-center">
        <h1 className="text-xl font-semibold">Standard not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">It is not in the indexed dataset, or it has been archived.</p>
        <Link href="/standards" className="mt-4 inline-block text-sm font-medium text-navy-700 hover:underline">Back to standards</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/standards" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Standards
      </Link>
      <div className="mb-6">
        <p className="eyebrow mb-1">{SECTOR_LABELS[s.sector]}</p>
        <h1 className="text-2xl font-semibold">{designation(s)}</h1>
        <p className="mt-1 text-base text-muted-foreground">{s.title}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone="neutral">{STANDARD_KIND_LABELS[s.kind]}</Chip>
          <Chip tone={s.status === 'CURRENT' ? 'info' : 'danger'}>{STANDARD_STATUS_LABELS[s.status]}</Chip>
          <Chip tone={s.verification.status === 'VERIFIED' ? 'success' : 'warning'}>{s.verification.status === 'VERIFIED' ? `Verified ${s.verification.verifiedAt?.slice(0, 10) ?? ''}` : 'Unverified — verify on BIS portal'}</Chip>
          <Chip tone="navy">{DATA_ORIGIN_LABELS[s.dataOrigin]}</Chip>
          {s.adoptedFrom ? <Chip tone="neutral">Based on {s.adoptedFrom}</Chip> : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Scope</h2>
            <p className="mt-2 text-sm text-foreground">{s.scope}</p>
            <p className="mt-2 text-xs text-muted-foreground">Curated summary for matching — not the official text of the standard.</p>
            {s.keywords.length ? <p className="mt-3 text-xs text-muted-foreground">Keywords: {s.keywords.join(', ')}</p> : null}
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Relationships</h2>
            {outgoing.data.length || incoming.data.length ? (
              <ul className="mt-3 space-y-3">
                {[...outgoing.data.map((r) => ({ r, dir: 'out' as const })), ...incoming.data.map((r) => ({ r, dir: 'in' as const }))].map(({ r, dir }) => {
                  const otherId = dir === 'out' ? r.toId : r.fromId;
                  const other = names.get(otherId);
                  return (
                    <li key={`${dir}-${r.id}`} className="rounded-lg border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {dir === 'out' ? RELATIONSHIP_LABELS[r.type] : `${RELATIONSHIP_LABELS[r.type]} for`}
                      </p>
                      <Link href={`/standards/${otherId}`} className="text-sm font-semibold text-navy-900 hover:underline">
                        {other ? designation(other) : otherId}
                      </Link>
                      {other ? <p className="text-xs text-muted-foreground">{other.title}</p> : null}
                      <p className="mt-1 text-sm text-foreground">{r.provenance.statement}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{RELATIONSHIP_PROVENANCE_LABELS[r.provenance.type]} · {r.verification.status.toLowerCase()}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No curated relationships recorded for this standard.</p>
            )}
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Certification context</h2>
            {rules.data.length ? (
              <ul className="mt-3 space-y-3">
                {rules.data.map((rule) => (
                  <li key={rule.id} className="rounded-lg border p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CERTIFICATION_SCHEME_LABELS[rule.scheme]}</p>
                    <p className="font-semibold text-navy-900">{rule.title}</p>
                    <p className="mt-1 text-foreground">{rule.explanation}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rule.instrument} · when matched: {CERTIFICATION_CLASS_LABELS[rule.classificationWhenMatched].toLowerCase()} · rule {rule.verification.status.toLowerCase()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No indexed certification rule references this standard. This does not establish that none applies.</p>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Versions</h2>
            <ol className="mt-3 space-y-2">
              {[...s.versionHistory].sort((a, b) => (a.year ?? 0) - (b.year ?? 0)).map((v) => (
                <li key={v.designation} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{v.designation}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.label} · {STANDARD_STATUS_LABELS[v.status]}
                  </p>
                  {v.note ? <p className="mt-1 text-xs text-muted-foreground">{v.note}</p> : null}
                </li>
              ))}
              {s.supersededBy ? (
                <li className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-sm">
                  Superseded by{' '}
                  {s.supersededBy.standardId ? (
                    <Link className="font-medium text-navy-900 hover:underline" href={`/standards/${s.supersededBy.standardId}`}>
                      {s.supersededBy.designation}
                    </Link>
                  ) : (
                    s.supersededBy.designation
                  )}
                </li>
              ) : null}
            </ol>
            {s.supersedes.length ? <p className="mt-3 text-xs text-muted-foreground">Supersedes: {s.supersedes.map((x) => x.designation).join(', ')}</p> : null}
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Amendments</h2>
            {s.amendmentDataStatus === 'NOT_INDEXED' ? (
              <p className="mt-2 text-sm text-muted-foreground">Amendment data is not indexed for this standard. Check the BIS portal for current amendments.</p>
            ) : s.amendments.length ? (
              <ul className="mt-2 space-y-2">
                {s.amendments.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="font-medium">Amendment No. {a.number}{a.date ? ` · ${a.date}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{a.summary}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No amendments recorded in the indexed data.</p>
            )}
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Sources</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {[s.source, ...s.evidenceReferences].map((src, i) => (
                <li key={`${src.name}-${i}`}>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline">
                      {src.name} <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="font-medium">{src.name}</span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {src.retrievedAt ? `Retrieved ${src.retrievedAt}` : ''}
                    {src.note ? ` · ${src.note}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            {s.verification.note ? <p className="mt-3 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">{s.verification.note}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
