'use client';

import { collection, query } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { CuratedRelationshipType, RelationshipProvenanceType } from '@shared/constants';
import { CURATED_RELATIONSHIP_TYPES, RELATIONSHIP_LABELS, RELATIONSHIP_PROVENANCE_LABELS } from '@shared/constants';
import { type RelationshipRecord, RelationshipRecordSchema, type StandardRecord } from '@shared/knowledge';
import { Chip } from '@/components/fiispec/badges';
import { Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { JsonRecordDialog } from '@/features/admin/json-record-dialog';
import { RecordActions } from '@/features/admin/record-actions';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';

const PROVENANCE_TYPES: RelationshipProvenanceType[] = ['STANDARD_REFERENCES_CLAUSE', 'OFFICIAL_CATALOGUE', 'CURATED_EXPERT'];

function NewRelationshipDialog({ open, onOpenChange, standards }: { open: boolean; onOpenChange: (o: boolean) => void; standards: StandardRecord[] }) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [type, setType] = useState<CuratedRelationshipType>('NORMATIVE_REFERENCE');
  const [provenanceType, setProvenanceType] = useState<RelationshipProvenanceType>('STANDARD_REFERENCES_CLAUSE');
  const [statement, setStatement] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [contextNote, setContextNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = [...standards].sort((a, b) => a.standardNumber.localeCompare(b.standardNumber));

  const save = async () => {
    const record = {
      id: `${fromId}--${type.toLowerCase().replace(/_/g, '-')}--${toId}`,
      fromId,
      toId,
      type,
      provenance: {
        type: provenanceType,
        statement: statement.trim(),
        ...(sourceName.trim() ? { source: { name: sourceName.trim(), ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}), retrievedAt: new Date().toISOString().slice(0, 10), sourceType: provenanceType === 'OFFICIAL_CATALOGUE' ? ('GOVERNMENT_PORTAL' as const) : ('CURATED' as const) } } : {}),
      },
      ...(contextNote.trim() ? { contextNote: contextNote.trim() } : {}),
      verification: { status: 'UNVERIFIED' as const },
      lifecycle: 'PUBLISHED' as const,
    };
    const parsed = RelationshipRecordSchema.safeParse(record);
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    if (provenanceType === 'OFFICIAL_CATALOGUE' && !sourceUrl.trim()) {
      toast.error('Official provenance requires a source URL.');
      return;
    }
    setBusy(true);
    try {
      await api.adminUpsertRelationship({ record: parsed.data });
      toast.success('Relationship saved.');
      onOpenChange(false);
      setStatement('');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New relationship</DialogTitle>
          <DialogDescription>Every relationship needs provenance: where does the connection come from?</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field id="rel-from" label="From standard">
            <NativeSelect id="rel-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Select…</option>
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>{s.standardNumber} — {s.title.slice(0, 60)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rel-type" label="Relationship type">
            <NativeSelect id="rel-type" value={type} onChange={(e) => setType(e.target.value as CuratedRelationshipType)}>
              {CURATED_RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>{RELATIONSHIP_LABELS[t]}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rel-to" label="To standard">
            <NativeSelect id="rel-to" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select…</option>
              {sorted.filter((s) => s.id !== fromId).map((s) => (
                <option key={s.id} value={s.id}>{s.standardNumber} — {s.title.slice(0, 60)}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rel-prov" label="Provenance">
            <NativeSelect id="rel-prov" value={provenanceType} onChange={(e) => setProvenanceType(e.target.value as RelationshipProvenanceType)}>
              {PROVENANCE_TYPES.map((p) => (
                <option key={p} value={p}>{RELATIONSHIP_PROVENANCE_LABELS[p]}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rel-statement" label="Provenance statement" hint="Why does this relationship exist? e.g. “Listed in clause 2 (Normative references) of IS …”">
            <Textarea id="rel-statement" rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="rel-source" label="Source name" optional>
              <Input id="rel-source" className="h-10" value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
            </Field>
            <Field id="rel-url" label="Source URL" optional>
              <Input id="rel-url" className="h-10" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <Field id="rel-context" label="Context note" optional hint="When does this relationship matter? e.g. “Relevant for outdoor installation.”">
            <Input id="rel-context" className="h-10" value={contextNote} onChange={(e) => setContextNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !fromId || !toId}>{busy ? 'Saving…' : 'Save relationship'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRelationshipsPage() {
  const rels = useQuery<RelationshipRecord>(() => query(collection(getFirebase().db, 'standardRelationships')), 'admin-rels');
  const standards = useQuery<StandardRecord>(() => query(collection(getFirebase().db, 'standards')), 'admin-rel-standards');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RelationshipRecord | null>(null);
  const [filter, setFilter] = useState('');
  const byId = useMemo(() => new Map(standards.data.map((s) => [s.id, s])), [standards.data]);
  const visible = rels.data.filter((r) => !filter || `${r.fromId} ${r.toId} ${r.type}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relationships</h1>
          <p className="text-sm text-muted-foreground">Curated, provenance-backed connections between standards. No arbitrary relationships.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus aria-hidden /> New relationship</Button>
      </div>
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by standard id or type" className="h-10 max-w-md" aria-label="Filter relationships" />
      {rels.loading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Standard relationships</caption>
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">From</th>
                <th scope="col" className="px-4 py-2.5">Type</th>
                <th scope="col" className="px-4 py-2.5">To</th>
                <th scope="col" className="px-4 py-2.5">Provenance</th>
                <th scope="col" className="px-4 py-2.5">State</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium">{byId.get(r.fromId)?.standardNumber ?? r.fromId}</td>
                  <td className="px-4 py-2.5">{RELATIONSHIP_LABELS[r.type]}</td>
                  <td className="px-4 py-2.5 font-medium">{byId.get(r.toId)?.standardNumber ?? r.toId}</td>
                  <td className="max-w-md px-4 py-2.5">
                    <p className="text-xs font-medium">{RELATIONSHIP_PROVENANCE_LABELS[r.provenance.type]}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{r.provenance.statement}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Chip tone={r.verification.status === 'VERIFIED' ? 'success' : 'warning'}>{r.verification.status.toLowerCase()}</Chip>
                      <Chip tone={r.lifecycle === 'PUBLISHED' ? 'info' : 'neutral'}>{r.lifecycle.toLowerCase()}</Chip>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RecordActions collection="standardRelationships" id={r.id} lifecycle={r.lifecycle} onEdit={() => setEditing(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewRelationshipDialog open={creating} onOpenChange={setCreating} standards={standards.data} />
      <JsonRecordDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit relationship"
        description="Validated against the RelationshipRecord schema."
        schema={RelationshipRecordSchema}
        initial={editing}
        onSave={async (record) => {
          await api.adminUpsertRelationship({ record });
        }}
      />
    </div>
  );
}
