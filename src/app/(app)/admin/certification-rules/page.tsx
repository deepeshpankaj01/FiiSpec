'use client';

import { collection, query } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { CERTIFICATION_CLASS_LABELS, CERTIFICATION_SCHEME_LABELS } from '@shared/constants';
import { type CertificationRule, CertificationRuleSchema } from '@shared/knowledge';
import { Chip } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonRecordDialog } from '@/features/admin/json-record-dialog';
import { RecordActions } from '@/features/admin/record-actions';
import { api } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';

const TEMPLATE: CertificationRule = {
  id: 'new-rule',
  title: 'Rule title',
  scheme: 'QUALITY_CONTROL_ORDER',
  authority: 'Issuing authority',
  instrument: 'Exact name, S.O. number and date of the order',
  standardIds: [],
  productCategories: [],
  conditionTermsAny: [],
  conditionDescription: 'When the rule applies.',
  classificationWhenMatched: 'APPLICABLE',
  explanation: 'What the rule requires, in one or two sentences.',
  source: { name: 'Official source', url: 'https://www.bis.gov.in/', retrievedAt: new Date().toISOString().slice(0, 10), sourceType: 'GOVERNMENT_PORTAL' },
  dataOrigin: 'OFFICIAL_SOURCE',
  verification: { status: 'UNVERIFIED' },
  lifecycle: 'DRAFT',
};

export default function AdminCertificationRulesPage() {
  const rules = useQuery<CertificationRule>(() => query(collection(getFirebase().db, 'certificationRules')), 'admin-rules');
  const [editing, setEditing] = useState<CertificationRule | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Certification rules</h1>
          <p className="text-sm text-muted-foreground">Unverified rules are capped at “Potentially applicable”. Never enter a requirement you have not found in an official notification.</p>
        </div>
        <Button onClick={() => setEditing(TEMPLATE)}><Plus aria-hidden /> New rule</Button>
      </div>
      {rules.loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-3">
          {rules.data.map((r) => (
            <article key={r.id} className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CERTIFICATION_SCHEME_LABELS[r.scheme]}</p>
                <h2 className="font-semibold">{r.title}</h2>
                <p className="text-sm text-muted-foreground">{r.instrument}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Standards: {r.standardIds.join(', ') || '—'} · When matched: {CERTIFICATION_CLASS_LABELS[r.classificationWhenMatched].toLowerCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone={r.verification.status === 'VERIFIED' ? 'success' : 'warning'}>{r.verification.status.toLowerCase()}</Chip>
                <Chip tone={r.lifecycle === 'PUBLISHED' ? 'info' : 'neutral'}>{r.lifecycle.toLowerCase()}</Chip>
                <RecordActions collection="certificationRules" id={r.id} lifecycle={r.lifecycle} onEdit={() => setEditing(r)} />
              </div>
            </article>
          ))}
        </div>
      )}
      <JsonRecordDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id === TEMPLATE.id ? 'New certification rule' : 'Edit certification rule'}
        description="Validated against the CertificationRule schema."
        schema={CertificationRuleSchema}
        initial={editing}
        onSave={async (record) => {
          await api.adminUpsertCertificationRule({ record });
        }}
      />
    </div>
  );
}
