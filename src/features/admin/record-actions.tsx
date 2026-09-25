'use client';

import { Archive, BadgeCheck, CheckCircle2, MoreHorizontal, Pencil, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { KbCollection } from '@shared/api';
import type { LifecycleState } from '@shared/constants';
import { Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { api, friendlyError } from '@/lib/firebase/callables';

type Mode = { kind: 'lifecycle'; to: LifecycleState } | { kind: 'verify' } | null;

/** Edit / verify / archive / publish actions with a mandatory audit reason. Records are never hard-deleted. */
export function RecordActions({
  collection,
  id,
  lifecycle,
  verifiable = true,
  onEdit,
}: {
  collection: KbCollection;
  id: string;
  lifecycle: LifecycleState;
  verifiable?: boolean;
  onEdit: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'VERIFIED' | 'UNVERIFIED' | 'DISPUTED'>('VERIFIED');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!mode) return;
    if (reason.trim().length < 3) {
      toast.error(mode.kind === 'verify' ? 'Record how this was verified (source and date).' : 'A reason is required for the audit log.');
      return;
    }
    setBusy(true);
    try {
      if (mode.kind === 'lifecycle') await api.adminSetLifecycle({ collection, id, lifecycle: mode.to, reason: reason.trim() });
      else await api.adminVerifyRecord({ collection: collection as 'standards' | 'standardRelationships' | 'certificationRules', id, status, note: reason.trim() });
      toast.success('Saved and recorded in the audit log.');
      setMode(null);
      setReason('');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${id}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil aria-hidden /> Edit
          </DropdownMenuItem>
          {verifiable ? (
            <DropdownMenuItem onClick={() => setMode({ kind: 'verify' })}>
              <BadgeCheck aria-hidden /> Record verification
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {lifecycle !== 'PUBLISHED' ? (
            <DropdownMenuItem onClick={() => setMode({ kind: 'lifecycle', to: 'PUBLISHED' })}>
              <Upload aria-hidden /> Publish
            </DropdownMenuItem>
          ) : null}
          {lifecycle !== 'ARCHIVED' ? (
            <DropdownMenuItem onClick={() => setMode({ kind: 'lifecycle', to: 'ARCHIVED' })}>
              <Archive aria-hidden /> Archive
            </DropdownMenuItem>
          ) : null}
          {lifecycle !== 'DRAFT' ? (
            <DropdownMenuItem onClick={() => setMode({ kind: 'lifecycle', to: 'DRAFT' })}>
              <CheckCircle2 aria-hidden /> Move to draft
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode?.kind === 'verify' ? 'Record verification' : `Change lifecycle to ${mode?.kind === 'lifecycle' ? mode.to.toLowerCase() : ''}`}</DialogTitle>
            <DialogDescription>
              {mode?.kind === 'verify'
                ? 'Mark this record as verified only after checking it against the current official source (e.g. the BIS portal). Your name and the date are recorded.'
                : 'Archived records stop being used by the pipeline but are kept for audit. Nothing is permanently deleted.'}
            </DialogDescription>
          </DialogHeader>
          {mode?.kind === 'verify' ? (
            <Field id="verify-status" label="Verification status">
              <NativeSelect id="verify-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="VERIFIED">Verified against official source</option>
                <option value="DISPUTED">Disputed — does not match the official source</option>
                <option value="UNVERIFIED">Unverified</option>
              </NativeSelect>
            </Field>
          ) : null}
          <Field id="action-reason" label={mode?.kind === 'verify' ? 'How was this verified?' : 'Reason'}>
            <Textarea id="action-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode?.kind === 'verify' ? 'e.g. Checked BIS e-Sale listing on 2026-09-25: status active, 0 amendments.' : 'e.g. Duplicate record; replaced by …'} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
