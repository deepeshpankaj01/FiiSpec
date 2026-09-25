'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { CheckCircle2, ClipboardCheck, MessageSquareWarning, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ReviewTaskDoc } from '@shared/analysis';
import { Chip } from '@/components/fiispec/badges';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/auth-provider';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { timeAgo } from '@/lib/format';

const DECIDERS = ['ADMIN', 'REVIEWER', 'PROCUREMENT_OFFICER'];
const STATUS_TONE = { OPEN: 'warning', IN_REVIEW: 'info', APPROVED: 'success', CHANGES_REQUESTED: 'danger' } as const;
const TRIGGER_LABEL = { ABSTENTION: 'Insufficient evidence (automatic)', LOW_CONFIDENCE: 'Low confidence', MANUAL_REQUEST: 'Requested by a member', SPEC_APPROVAL: 'Specification approval' } as const;

function TaskCard({ task, canDecide, uid }: { task: ReviewTaskDoc; canDecide: boolean; uid: string | undefined }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (decision: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED') => {
    setBusy(true);
    try {
      await api.submitReview({ taskId: task.id, decision, note: note.trim() || undefined });
      toast.success(decision === 'IN_REVIEW' ? 'Review started.' : decision === 'APPROVED' ? 'Review approved.' : 'Changes requested.');
      setNote('');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const closed = task.status === 'APPROVED';
  const ownRequest = task.requestedBy === uid;
  return (
    <article className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/analysis/${task.analysisId}`} className="text-base font-semibold text-navy-900 hover:underline">
            {task.analysisTitle}
          </Link>
          <p className="text-xs text-muted-foreground">
            {TRIGGER_LABEL[task.trigger]} · {task.requestedByName} · {timeAgo(task.createdAt)}
            {task.assignedToName ? ` · assigned to ${task.assignedToName}` : ''}
          </p>
        </div>
        <Chip tone={STATUS_TONE[task.status]}>{task.status.replace('_', ' ').toLowerCase()}</Chip>
      </div>
      <p className="mt-2 text-sm text-foreground">{task.reason}</p>
      {task.decisionNote ? (
        <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="font-medium">{task.decidedBy}: </span>
          {task.decisionNote}
        </p>
      ) : null}
      {canDecide && !closed ? (
        <div className="mt-3 space-y-2">
          <Textarea aria-label="Review note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (recorded in the audit trail)" className="text-sm" />
          <div className="flex flex-wrap gap-2">
            {task.status === 'OPEN' ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide('IN_REVIEW')}>
                <PlayCircle aria-hidden /> Start review
              </Button>
            ) : null}
            <Button size="sm" disabled={busy || ownRequest} onClick={() => void decide('APPROVED')} title={ownRequest ? 'A different member must approve a review you requested' : undefined}>
              <CheckCircle2 aria-hidden /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide('CHANGES_REQUESTED')}>
              <MessageSquareWarning aria-hidden /> Request changes
            </Button>
          </div>
          {ownRequest ? <p className="text-xs text-muted-foreground">You requested this review, so another member must approve it.</p> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function ReviewsPage() {
  const { claims, user } = useAuth();
  const [filter, setFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const tasks = useQuery<ReviewTaskDoc>(
    claims.orgId ? () => query(collection(getFirebase().db, 'reviewTasks'), where('orgId', '==', claims.orgId), orderBy('createdAt', 'desc'), limit(100)) : null,
    `reviews-${claims.orgId}`,
  );
  const canDecide = claims.role !== null && DECIDERS.includes(claims.role);
  const visible = tasks.data.filter((t) => filter === 'ALL' || t.status === 'OPEN' || t.status === 'IN_REVIEW' || t.status === 'CHANGES_REQUESTED');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reviews" description="Analyses that need a human decision — automatic when FiiSpec abstains, or requested by a member." />
      <div className="mb-4 inline-flex rounded-lg border bg-white p-0.5" role="group" aria-label="Filter reviews">
        <Button size="sm" variant={filter === 'ACTIVE' ? 'default' : 'ghost'} onClick={() => setFilter('ACTIVE')} aria-pressed={filter === 'ACTIVE'}>
          Active
        </Button>
        <Button size="sm" variant={filter === 'ALL' ? 'default' : 'ghost'} onClick={() => setFilter('ALL')} aria-pressed={filter === 'ALL'}>
          All
        </Button>
      </div>
      {tasks.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : tasks.error ? (
        <p className="text-sm text-danger">{tasks.error}</p>
      ) : visible.length ? (
        <div className="space-y-3">
          {visible.map((t) => (
            <TaskCard key={t.id} task={t} canDecide={canDecide} uid={user?.uid} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-14 text-center">
          <ClipboardCheck className="mb-3 size-8 text-navy-700" aria-hidden />
          <h2 className="font-semibold">No review tasks</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tasks appear here when FiiSpec abstains or a member requests a review.</p>
        </div>
      )}
    </div>
  );
}
