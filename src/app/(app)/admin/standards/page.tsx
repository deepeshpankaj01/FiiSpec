'use client';

import { collection, query } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type StandardRecord, StandardRecordSchema } from '@shared/knowledge';
import { STANDARD_STATUS_LABELS } from '@shared/constants';
import { Chip } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonRecordDialog } from '@/features/admin/json-record-dialog';
import { RecordActions } from '@/features/admin/record-actions';
import { api } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';

const NEW_STANDARD_TEMPLATE: StandardRecord = {
  id: 'is-00000',
  standardNumber: 'IS 00000',
  baseNumber: '00000',
  prefix: 'IS',
  title: 'Title exactly as listed by BIS',
  sector: 'GENERAL',
  kind: 'PRODUCT',
  scope: 'Short curated summary of the scope (not the official text).',
  status: 'UNKNOWN',
  supersedes: [],
  versionHistory: [],
  amendments: [],
  amendmentDataStatus: 'NOT_INDEXED',
  keywords: [],
  productTypes: [],
  source: { name: 'BIS e-Sale portal — standard listing', url: 'https://standardsbis.bsbedge.com/', retrievedAt: new Date().toISOString().slice(0, 10), sourceType: 'BIS_CATALOGUE' },
  evidenceReferences: [],
  dataOrigin: 'CURATED_PUBLIC_REFERENCE',
  verification: { status: 'UNVERIFIED' },
  lifecycle: 'DRAFT',
};

export default function AdminStandardsPage() {
  const standards = useQuery<StandardRecord>(() => query(collection(getFirebase().db, 'standards')), 'admin-standards');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<StandardRecord | null>(null);
  const visible = useMemo(() => {
    const f = filter.toLowerCase();
    return [...standards.data]
      .filter((s) => !f || `${s.standardNumber} ${s.title} ${s.id}`.toLowerCase().includes(f))
      .sort((a, b) => Number(a.baseNumber) - Number(b.baseNumber) || a.standardNumber.localeCompare(b.standardNumber));
  }, [standards.data, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Standards</h1>
          <p className="text-sm text-muted-foreground">Edit, verify, publish or archive standard records. Editing resets verification.</p>
        </div>
        <Button onClick={() => setEditing(NEW_STANDARD_TEMPLATE)}>
          <Plus aria-hidden /> New standard
        </Button>
      </div>
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by number, title or id" className="h-10 max-w-md" aria-label="Filter standards" />
      {standards.loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Standards in the knowledge base</caption>
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">Standard</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5">Verification</th>
                <th scope="col" className="px-4 py-2.5">Lifecycle</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/standards/${s.id}`} className="font-medium text-navy-900 hover:underline">
                      {s.standardNumber}
                      {s.publicationYear ? ` : ${s.publicationYear}` : ''}
                    </Link>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{s.title}</p>
                  </td>
                  <td className="px-4 py-2.5">{STANDARD_STATUS_LABELS[s.status]}</td>
                  <td className="px-4 py-2.5">
                    <Chip tone={s.verification.status === 'VERIFIED' ? 'success' : s.verification.status === 'DISPUTED' ? 'danger' : 'warning'}>{s.verification.status.toLowerCase()}</Chip>
                  </td>
                  <td className="px-4 py-2.5">
                    <Chip tone={s.lifecycle === 'PUBLISHED' ? 'info' : 'neutral'}>{s.lifecycle.toLowerCase()}</Chip>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RecordActions collection="standards" id={s.id} lifecycle={s.lifecycle} onEdit={() => setEditing(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <JsonRecordDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id === NEW_STANDARD_TEMPLATE.id ? 'New standard' : `Edit ${editing?.standardNumber ?? ''}`}
        description="Validated against the canonical StandardRecord schema. Never enter standard numbers or titles that you have not confirmed from an official source."
        schema={StandardRecordSchema}
        initial={editing}
        onSave={async (record) => {
          await api.adminUpsertStandard({ record });
        }}
      />
    </div>
  );
}
