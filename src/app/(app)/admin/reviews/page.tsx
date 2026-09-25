'use client';

import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { toast } from 'sonner';
import type { AnalysisDoc, ReviewTaskDoc } from '@shared/analysis';
import { Chip } from '@/components/fiispec/badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { timeAgo } from '@/lib/format';

interface FeedbackDoc {
  id: string;
  analysisId: string;
  analysisTitle: string;
  userName: string;
  targetType: string;
  targetId: string;
  rating: 'HELPFUL' | 'NOT_HELPFUL' | 'INCORRECT';
  comment: string | null;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
}

export default function AdminReviewsPage() {
  // Query builders run inside effects (browser only), never during server rendering.
  const failed = useQuery<AnalysisDoc>(() => query(collection(getFirebase().db, 'analyses'), where('status', '==', 'FAILED'), orderBy('createdAt', 'desc'), limit(25)), 'admin-failed');
  const tasks = useQuery<ReviewTaskDoc>(() => query(collection(getFirebase().db, 'reviewTasks'), where('status', '==', 'OPEN'), orderBy('createdAt', 'desc'), limit(25)), 'admin-tasks');
  const feedback = useQuery<FeedbackDoc>(() => query(collection(getFirebase().db, 'feedback'), where('status', '==', 'OPEN'), orderBy('createdAt', 'desc'), limit(50)), 'admin-feedback');

  const resolve = async (id: string, status: 'ACKNOWLEDGED' | 'RESOLVED') => {
    try {
      await api.adminResolveFeedback({ feedbackId: id, status });
      toast.success('Feedback updated.');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Failed analyses</h1>
        {failed.loading ? <Skeleton className="h-40" /> : failed.data.length ? (
          <ul className="divide-y rounded-xl border bg-white">
            {failed.data.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <Link href={`/analysis/${a.id}`} className="text-sm font-medium text-navy-900 hover:underline">{a.title}</Link>
                <p className="text-xs text-muted-foreground">{a.error?.code ?? 'UNKNOWN'} · {a.error?.message} · {timeAgo(a.updatedAt)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No failed analyses.</p>}

        <h2 className="mb-3 mt-6 text-lg font-semibold">Open review tasks (all organisations)</h2>
        {tasks.loading ? <Skeleton className="h-40" /> : tasks.data.length ? (
          <ul className="divide-y rounded-xl border bg-white">
            {tasks.data.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <Link href={`/analysis/${t.analysisId}`} className="text-sm font-medium text-navy-900 hover:underline">{t.analysisTitle}</Link>
                <p className="text-xs text-muted-foreground">{t.trigger.toLowerCase().replace('_', ' ')} · {t.reason}</p>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No review tasks.</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">User feedback</h2>
        {feedback.loading ? <Skeleton className="h-40" /> : feedback.data.length ? (
          <ul className="space-y-2">
            {feedback.data.map((f) => (
              <li key={f.id} className="rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={f.rating === 'INCORRECT' ? 'danger' : f.rating === 'HELPFUL' ? 'success' : 'warning'}>{f.rating.toLowerCase().replace('_', ' ')}</Chip>
                  <span className="text-xs text-muted-foreground">{f.targetType.toLowerCase()} · {f.userName} · {timeAgo(f.createdAt)}</span>
                </div>
                <Link href={`/analysis/${f.analysisId}`} className="mt-1 block text-sm font-medium text-navy-900 hover:underline">{f.analysisTitle}</Link>
                <p className="text-xs text-muted-foreground">Target: {f.targetId}</p>
                {f.comment ? <p className="mt-1 text-sm">{f.comment}</p> : null}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void resolve(f.id, 'ACKNOWLEDGED')}>Acknowledge</Button>
                  <Button size="sm" onClick={() => void resolve(f.id, 'RESOLVED')}>Resolve</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">No open feedback.</p>}
      </section>
    </div>
  );
}
