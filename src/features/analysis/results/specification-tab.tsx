'use client';

import { collection, query, where } from 'firebase/firestore';
import { BadgeCheck, Bot, ClipboardCopy, FilePenLine, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AnalysisDoc, GeneratedSpecificationDoc, SpecItem, SpecSection } from '@shared/analysis';
import { SPEC_ITEM_ORIGIN_LABELS } from '@shared/analysis';
import { SPEC_DOC_STATUS_LABELS } from '@shared/constants';
import { Chip } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-provider';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const EDITORS = ['ADMIN', 'PROCUREMENT_OFFICER', 'REVIEWER'];

const ORIGIN_TONE: Record<SpecItem['origin'], 'navy' | 'neutral' | 'saffron' | 'warning' | 'info' | 'success'> = {
  SPECIFICATION_INPUT: 'info',
  KNOWLEDGE_BASE: 'navy',
  DRAFTING_TEMPLATE: 'neutral',
  GAP_PLACEHOLDER: 'warning',
  AI_DRAFT: 'saffron',
  HUMAN_EDIT: 'success',
};

export function specToPlainText(spec: GeneratedSpecificationDoc): string {
  const header = [`PROCUREMENT SPECIFICATION — version ${spec.version}`, `Status: ${SPEC_DOC_STATUS_LABELS[spec.status]}`, 'Decision-support draft generated with FiiSpec. Not official government text; verify against current official requirements.', ''];
  const body = spec.sections.map((s) => [s.title, ...s.items.map((i) => `  • ${i.text}`)].join('\n'));
  return [...header, ...body].join('\n\n');
}

function Generate({ analysisId, label = 'Generate Procurement Specification', variant = 'default' }: { analysisId: string; label?: string; variant?: 'default' | 'outline' }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.generateProcurementSpecification({ analysisId });
          toast.success('Specification draft generated.');
        } catch (e) {
          toast.error(friendlyError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : variant === 'default' ? <FilePenLine aria-hidden /> : <RefreshCw aria-hidden />} {busy ? 'Generating…' : label}
    </Button>
  );
}

export function SpecificationTab({ analysis }: { analysis: AnalysisDoc }) {
  const { claims } = useAuth();
  const specs = useQuery<GeneratedSpecificationDoc>(
    claims.orgId ? () => query(collection(getFirebase().db, 'analyses', analysis.id, 'specifications'), where('orgId', '==', claims.orgId)) : null,
    `specs-${analysis.id}-${claims.orgId}`,
  );
  const sorted = useMemo(() => [...specs.data].sort((a, b) => b.version - a.version), [specs.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = sorted.find((s) => s.id === selectedId) ?? sorted[0] ?? null;
  const canEdit = claims.role !== null && EDITORS.includes(claims.role);

  if (specs.loading) return <Skeleton className="h-64" />;

  if (!current) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center">
        <FilePenLine className="mx-auto mb-3 size-8 text-saffron-500" aria-hidden />
        <h2 className="text-lg font-semibold">Generate a procurement specification</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          FiiSpec assembles a structured draft from this analysis: product definition, technical requirements, applicable and related standards, testing, safety, installation, certification considerations, inspection and documentation. Missing parameters become placeholders for you to complete. When AI is enabled, only the product definition and technical requirement wording are AI-drafted — and rejected if they cite any standard not recommended here.
        </p>
        <div className="mt-5">
          <Generate analysisId={analysis.id} />
        </div>
      </div>
    );
  }

  // Keyed by version + last update so draft state re-initialises when the stored document changes.
  return <SpecDocumentView key={`${current.id}:${current.updatedAt}`} analysis={analysis} current={current} versions={sorted} onSelect={setSelectedId} canEdit={canEdit} />;
}

function SpecDocumentView({
  analysis,
  current,
  versions: sorted,
  onSelect: setSelectedId,
  canEdit,
}: {
  analysis: AnalysisDoc;
  current: GeneratedSpecificationDoc;
  versions: GeneratedSpecificationDoc[];
  onSelect: (id: string) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SpecSection[]>(current.sections);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const placeholders = (editing ? draft : current.sections).flatMap((s) => s.items).filter((i) => i.origin === 'GAP_PLACEHOLDER').length;
  const locked = current.status === 'HUMAN_REVIEWED';

  const updateItem = (sIndex: number, iIndex: number, text: string) =>
    setDraft((d) => d.map((s, si) => (si !== sIndex ? s : { ...s, items: s.items.map((it, ii) => (ii !== iIndex ? it : { ...it, text, origin: 'HUMAN_EDIT' })) })));
  const removeItem = (sIndex: number, iIndex: number) => setDraft((d) => d.map((s, si) => (si !== sIndex ? s : { ...s, items: s.items.filter((_, ii) => ii !== iIndex) })));
  const addItem = (sIndex: number) => setDraft((d) => d.map((s, si) => (si !== sIndex ? s : { ...s, items: [...s.items, { text: '', origin: 'HUMAN_EDIT', standardIds: [] }] })));

  const save = async () => {
    const sections = draft.map((s) => ({ key: s.key, items: s.items.filter((i) => i.text.trim()).map((i) => ({ ...i, text: i.text.trim() })) }));
    setBusy(true);
    try {
      await api.saveSpecificationDraft({ analysisId: analysis.id, specId: current.id, sections });
      toast.success('Draft saved.');
      setEditing(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await api.approveSpecification({ analysisId: analysis.id, specId: current.id, note: note.trim() || undefined });
      toast.success('Specification approved as human-reviewed.');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className={cn('rounded-xl border p-4', locked ? 'border-success/30 bg-success-bg' : 'border-warning/30 bg-warning-bg')} role="status">
          <div className="flex flex-wrap items-center gap-2">
            {locked ? <BadgeCheck className="size-5 text-success" aria-hidden /> : <TriangleAlert className="size-5 text-warning" aria-hidden />}
            <p className={cn('font-semibold', locked ? 'text-success' : 'text-warning')}>{SPEC_DOC_STATUS_LABELS[current.status]}</p>
            <span className="text-sm text-foreground">· version {current.version}</span>
            {current.generation.method === 'AI_ASSISTED' ? <Chip tone="saffron" icon={<Bot />}>AI-assisted wording (validated)</Chip> : <Chip tone="neutral">Deterministic template</Chip>}
          </div>
          <p className="mt-1 text-sm text-foreground">
            {locked
              ? `Approved by ${current.approvedByName ?? 'a reviewer'} on ${formatDateTime(current.approvedAt)}.${current.reviewNote ? ` Note: ${current.reviewNote}` : ''}`
              : 'This is a generated draft for human review. It is decision-support output and not official government text.'}
          </p>
          {current.generation.aiRejectedReason ? <p className="mt-1 text-xs text-muted-foreground">AI wording was not used: {current.generation.aiRejectedReason}</p> : null}
        </div>

        {(editing ? draft : current.sections).map((section, sIndex) => (
          <section key={section.key} aria-labelledby={`spec-${section.key}`} className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 id={`spec-${section.key}`} className="text-sm font-semibold">{section.title}</h3>
              {editing ? (
                <Button size="xs" variant="ghost" onClick={() => addItem(sIndex)}>
                  <Plus aria-hidden /> Add item
                </Button>
              ) : null}
            </div>
            {section.items.length ? (
              <ul className="space-y-2">
                {section.items.map((item, iIndex) => (
                  <li key={`${section.key}-${iIndex}`} className={cn('rounded-lg px-3 py-2', item.origin === 'GAP_PLACEHOLDER' ? 'bg-warning-bg' : 'bg-muted/40')}>
                    {editing ? (
                      <div className="flex gap-2">
                        <Textarea aria-label={`${section.title} item ${iIndex + 1}`} rows={2} value={item.text} onChange={(e) => updateItem(sIndex, iIndex, e.target.value)} className="bg-white text-sm" />
                        <Button size="icon-sm" variant="ghost" onClick={() => removeItem(sIndex, iIndex)} aria-label="Remove item">
                          <Trash2 />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground">{item.text}</p>
                    )}
                    <div className="mt-1">
                      <Chip tone={ORIGIN_TONE[item.origin]} className="h-5 text-[11px]">{SPEC_ITEM_ORIGIN_LABELS[item.origin]}</Chip>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No items.</p>
            )}
          </section>
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold">Actions</h3>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(specToPlainText({ ...current, sections: editing ? draft : current.sections }));
                toast.success('Specification copied to clipboard.');
              }}
            >
              <ClipboardCopy aria-hidden /> Copy to clipboard
            </Button>
            {canEdit && !locked ? (
              editing ? (
                <>
                  <Button onClick={() => void save()} disabled={busy}>
                    <Save aria-hidden /> Save draft
                  </Button>
                  <Button variant="ghost" onClick={() => { setDraft(current.sections); setEditing(false); }}>
                    Cancel editing
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden /> Edit draft
                </Button>
              )
            ) : null}
            <Generate analysisId={analysis.id} label="Generate new version" variant="outline" />
          </div>
          {!canEdit ? <p className="mt-3 text-xs text-muted-foreground">Procurement officers and reviewers can edit and approve specifications.</p> : null}
        </div>

        {canEdit && !locked ? (
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold">Approve as human-reviewed</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {placeholders ? `${placeholders} placeholder item(s) must be completed or removed before approval.` : 'All placeholders are resolved. Approval is recorded in the audit trail.'}
            </p>
            <Textarea aria-label="Approval note" rows={2} className="mt-2 text-sm" placeholder="Approval note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button className="mt-2 w-full" disabled={busy || placeholders > 0 || editing} onClick={() => void approve()}>
              <BadgeCheck aria-hidden /> Approve specification
            </Button>
          </div>
        ) : null}

        {sorted.length > 1 ? (
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold">Versions</h3>
            <ul className="mt-2 space-y-1">
              {sorted.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setSelectedId(s.id)} className={cn('w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', s.id === current.id && 'bg-muted font-medium')}>
                    v{s.version} · {s.status === 'HUMAN_REVIEWED' ? 'Human-reviewed' : 'Draft'} · {formatDateTime(s.createdAt)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
