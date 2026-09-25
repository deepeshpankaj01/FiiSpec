'use client';

import { collection, query } from 'firebase/firestore';
import { UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { UserRole } from '@shared/constants';
import { ROLE_LABELS } from '@shared/constants';
import { Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-provider';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';

interface Member {
  id: string;
  uid: string;
  displayName: string;
  role: UserRole;
}

export function RequestReviewDialog({ analysisId }: { analysisId: string }) {
  const { claims, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const members = useQuery<Member>(open && claims.orgId ? () => query(collection(getFirebase().db, 'organizations', claims.orgId!, 'members')) : null, `members-${claims.orgId}-${open}`);
  const reviewers = members.data.filter((m) => m.uid !== user?.uid && (m.role === 'REVIEWER' || m.role === 'PROCUREMENT_OFFICER' || m.role === 'ADMIN'));

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error('Explain what should be reviewed.');
      return;
    }
    setBusy(true);
    try {
      await api.requestReview({ analysisId, reason: reason.trim(), assignedTo: assignee || undefined });
      toast.success('Review requested.');
      setOpen(false);
      setReason('');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserCheck aria-hidden /> Request review
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a technical review</DialogTitle>
          <DialogDescription>A reviewer in your organisation will check the recommendations and gaps before they are used in a tender.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="review-reason" label="What should be reviewed?">
            <Textarea id="review-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Confirm the connector requirement and whether BIS certification applies." />
          </Field>
          <Field id="review-assignee" label="Assign to" optional>
            <NativeSelect id="review-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Any reviewer in the organisation</option>
              {reviewers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.displayName} — {ROLE_LABELS[m.role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Requesting…' : 'Request review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
