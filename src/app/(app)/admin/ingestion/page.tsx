'use client';

import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useState } from 'react';
import { toast } from 'sonner';
import { Chip } from '@/components/fiispec/badges';
import { Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { formatDateTime } from '@/lib/format';

interface IngestionRecord {
  id: string;
  source: string;
  sourceUrl: string | null;
  sourceType: string;
  retrievedAt: string | null;
  version: string;
  contentHash: string;
  recordType: 'standards' | 'standardRelationships' | 'certificationRules';
  status: 'STAGED' | 'INVALID' | 'PUBLISHED' | 'REJECTED';
  verificationStatus: string;
  errors: { index: number; message: string }[];
  counts: { valid: number; invalid: number; new: number; updates: number };
  stagedBy: string;
  stagedAt: string;
  decidedBy: string | null;
  decisionNote: string | null;
}

const SOURCE_TYPES = ['BIS_CATALOGUE', 'BIS_PUBLIC_DOCUMENT', 'GAZETTE_NOTIFICATION', 'GOVERNMENT_PORTAL', 'SECONDARY', 'CURATED'] as const;

function DecisionDialog({ record, onClose }: { record: IngestionRecord | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [markVerified, setMarkVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const decide = async (decision: 'PUBLISH' | 'REJECT') => {
    if (!record) return;
    setBusy(true);
    try {
      const res = await api.adminDecideIngestion({ ingestionId: record.id, decision, markVerified, note: note.trim() });
      toast.success(decision === 'PUBLISH' ? `Published ${res.published} record(s).` : 'Batch rejected.');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={record !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review ingestion batch</DialogTitle>
          <DialogDescription>
            {record?.counts.valid} valid record(s) from {record?.source}: {record?.counts.new} new, {record?.counts.updates} update(s).
          </DialogDescription>
        </DialogHeader>
        <Field id="ing-note" label="Decision note (audit log)">
          <Textarea id="ing-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={markVerified} onChange={(e) => setMarkVerified(e.target.checked)} className="mt-0.5 size-4 accent-navy-900" />
          <span>I have verified these records against the official source (records will be marked verified under my name).</span>
        </label>
        <DialogFooter>
          <Button variant="outline" disabled={busy || note.trim().length < 3} onClick={() => void decide('REJECT')}>Reject</Button>
          <Button disabled={busy || note.trim().length < 3} onClick={() => void decide('PUBLISH')}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminIngestionPage() {
  const records = useQuery<IngestionRecord>(() => query(collection(getFirebase().db, 'ingestionRecords'), orderBy('stagedAt', 'desc'), limit(50)), 'admin-ingestion');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState<(typeof SOURCE_TYPES)[number]>('BIS_CATALOGUE');
  const [retrievedAt, setRetrievedAt] = useState(new Date().toISOString().slice(0, 10));
  const [version, setVersion] = useState('');
  const [recordType, setRecordType] = useState<IngestionRecord['recordType']>('standards');
  const [payload, setPayload] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<IngestionRecord | null>(null);

  const stage = async () => {
    setBusy(true);
    try {
      const res = await api.adminStageIngestion({
        source: { name: sourceName.trim(), ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}), retrievedAt, sourceType },
        version: version.trim() || retrievedAt,
        recordType,
        payload,
      });
      toast.success(`Staged: ${res.valid} valid, ${res.invalid} invalid. Review before publishing.`);
      setPayload('');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Controlled ingestion</h1>
        <p className="text-sm text-muted-foreground">Stage records from an authorised source, review validation results, then publish. Each batch records its source, retrieval date, version and content hash. Do not ingest restricted content.</p>
      </div>
      <section className="grid gap-4 rounded-xl border bg-white p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field id="ing-source" label="Source name">
            <Input id="ing-source" className="h-10" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="e.g. BIS e-Sale portal export" />
          </Field>
          <Field id="ing-url" label="Source URL" optional>
            <Input id="ing-url" className="h-10" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ing-type" label="Source type">
              <NativeSelect id="ing-type" value={sourceType} onChange={(e) => setSourceType(e.target.value as (typeof SOURCE_TYPES)[number])}>
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.toLowerCase().replace(/_/g, ' ')}</option>)}
              </NativeSelect>
            </Field>
            <Field id="ing-date" label="Retrieved on">
              <Input id="ing-date" type="date" className="h-10" value={retrievedAt} onChange={(e) => setRetrievedAt(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ing-version" label="Version / batch label" optional>
              <Input id="ing-version" className="h-10" value={version} onChange={(e) => setVersion(e.target.value)} />
            </Field>
            <Field id="ing-record-type" label="Record type">
              <NativeSelect id="ing-record-type" value={recordType} onChange={(e) => setRecordType(e.target.value as IngestionRecord['recordType'])}>
                <option value="standards">Standards</option>
                <option value="standardRelationships">Relationships</option>
                <option value="certificationRules">Certification rules</option>
              </NativeSelect>
            </Field>
          </div>
        </div>
        <div className="space-y-3">
          <Field id="ing-payload" label="Records (JSON array)" hint="Each record is validated with the canonical schema; invalid records are reported by index and not staged.">
            <Textarea id="ing-payload" rows={12} className="font-mono text-xs" value={payload} onChange={(e) => setPayload(e.target.value)} placeholder='[{ "id": "is-…", … }]' spellCheck={false} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => void stage()} disabled={busy || sourceName.trim().length < 2 || payload.trim().length < 2}>{busy ? 'Validating…' : 'Validate and stage'}</Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Ingestion batches</h2>
        {records.loading ? (
          <Skeleton className="h-40" />
        ) : records.data.length ? (
          <ul className="space-y-3">
            {records.data.map((r) => (
              <li key={r.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.source} · {r.recordType}</p>
                    <p className="text-xs text-muted-foreground">
                      Staged by {r.stagedBy} · {formatDateTime(r.stagedAt)} · version {r.version} · hash {r.contentHash.slice(0, 12)}…
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={r.status === 'PUBLISHED' ? 'success' : r.status === 'STAGED' ? 'info' : 'danger'}>{r.status.toLowerCase()}</Chip>
                    {r.status === 'STAGED' ? <Button size="sm" onClick={() => setReviewing(r)}>Review</Button> : null}
                  </div>
                </div>
                <p className="mt-2 text-sm">
                  {r.counts.valid} valid · {r.counts.invalid} invalid · {r.counts.new} new · {r.counts.updates} updates
                </p>
                {r.errors.length ? (
                  <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs text-danger">
                    {r.errors.map((e) => <li key={`${e.index}-${e.message}`}>{e.index >= 0 ? `Record ${e.index}: ` : ''}{e.message}</li>)}
                  </ul>
                ) : null}
                {r.decisionNote ? <p className="mt-2 text-xs text-muted-foreground">{r.decidedBy}: {r.decisionNote}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No ingestion batches yet.</p>
        )}
      </section>
      <DecisionDialog record={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}
