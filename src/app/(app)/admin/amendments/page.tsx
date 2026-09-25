'use client';

import { collection, query } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Amendment, StandardRecord } from '@shared/knowledge';
import { StandardRecordSchema } from '@shared/knowledge';
import { Chip } from '@/components/fiispec/badges';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';

export default function AdminAmendmentsPage() {
  const standards = useQuery<StandardRecord>(() => query(collection(getFirebase().db, 'standards')), 'admin-amendments');
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState<Amendment[]>([]);
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...standards.data].sort((a, b) => a.standardNumber.localeCompare(b.standardNumber)), [standards.data]);
  const selected = sorted.find((s) => s.id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    const s = sorted.find((x) => x.id === id);
    setRows(s ? s.amendments.map((a) => ({ ...a })) : []);
  };
  const update = (i: number, patch: Partial<Amendment>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const save = async () => {
    if (!selected) return;
    const { createdAt: _c, updatedAt: _u, updatedBy: _b, ...rest } = selected as StandardRecord & { createdAt?: string; updatedAt?: string; updatedBy?: string };
    const record = { ...rest, amendments: rows.map((a, i) => ({ ...a, id: a.id || `amd-${i + 1}`, verification: a.verification ?? { status: 'UNVERIFIED' as const } })), amendmentDataStatus: 'INDEXED' as const };
    const parsed = StandardRecordSchema.safeParse(record);
    if (!parsed.success) {
      toast.error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; '));
      return;
    }
    setBusy(true);
    try {
      await api.adminUpsertStandard({ record: parsed.data });
      toast.success('Amendments saved. The standard now requires re-verification.');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Amendments</h1>
        <p className="text-sm text-muted-foreground">Record amendments only from an official source. Saving marks amendment data as indexed for that standard.</p>
      </div>
      {standards.loading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border bg-white">
            <ul className="max-h-[560px] divide-y overflow-y-auto">
              {sorted.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => select(s.id)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 ${s.id === selectedId ? 'bg-muted' : ''}`}>
                    <span className="truncate font-medium">{s.standardNumber}</span>
                    <Chip tone={s.amendmentDataStatus === 'INDEXED' ? 'info' : 'neutral'} className="h-5 text-[11px]">
                      {s.amendmentDataStatus === 'INDEXED' ? `${s.amendments.length} indexed` : 'not indexed'}
                    </Chip>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-white p-5">
            {selected ? (
              <>
                <h2 className="text-base font-semibold">{selected.standardNumber}{selected.publicationYear ? ` : ${selected.publicationYear}` : ''}</h2>
                <p className="text-sm text-muted-foreground">{selected.title}</p>
                <div className="mt-4 space-y-3">
                  {rows.map((row, i) => (
                    <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[80px_140px_1fr_auto]">
                      <Input aria-label="Amendment number" type="number" min={1} className="h-9" value={row.number} onChange={(e) => update(i, { number: Number(e.target.value) })} />
                      <Input aria-label="Amendment date" type="date" className="h-9" value={row.date ?? ''} onChange={(e) => update(i, { date: e.target.value || undefined })} />
                      <Input aria-label="Amendment summary" className="h-9" value={row.summary} onChange={(e) => update(i, { summary: e.target.value })} placeholder="What the amendment changes" />
                      <Button variant="ghost" size="icon-sm" aria-label="Remove amendment" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
                        <Trash2 />
                      </Button>
                      <div className="sm:col-span-4">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Verification
                          <NativeSelect className="h-8 w-40 text-xs" value={row.verification?.status ?? 'UNVERIFIED'} onChange={(e) => update(i, { verification: { status: e.target.value as 'VERIFIED' | 'UNVERIFIED' } })}>
                            <option value="UNVERIFIED">Unverified</option>
                            <option value="VERIFIED">Verified</option>
                          </NativeSelect>
                        </label>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { id: `amd-${r.length + 1}`, number: r.length + 1, summary: '', verification: { status: 'UNVERIFIED' } }])}>
                    <Plus aria-hidden /> Add amendment
                  </Button>
                </div>
                <div className="mt-5 flex justify-end">
                  <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save amendments'}</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a standard to view or record its amendments.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
