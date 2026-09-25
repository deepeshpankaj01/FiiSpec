'use client';

import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AnalysisDoc } from '@shared/analysis';
import { getFirebase } from '@/lib/firebase/client';
import { useAuth } from './auth-provider';

/**
 * In-app notifications, driven by the user's notification preferences:
 * - analysisCompleted: toast when one of the user's analyses finishes.
 * - reviewAssigned: count of open review tasks assigned to the user (shown in navigation).
 */
export function useInAppNotifications(): { assignedReviews: number } {
  const { user, claims, profile } = useAuth();
  const router = useRouter();
  const [assigned, setAssigned] = useState<{ key: string; count: number } | null>(null);
  const statuses = useRef(new Map<string, string>());
  const notifyCompleted = profile?.notifications?.analysisCompleted ?? true;
  const notifyReviews = profile?.notifications?.reviewAssigned ?? true;
  const reviewsKey = user && claims.orgId && notifyReviews ? `${claims.orgId}:${user.uid}` : null;

  useEffect(() => {
    if (!user || !claims.orgId || !notifyCompleted) return;
    const q = query(collection(getFirebase().db, 'analyses'), where('orgId', '==', claims.orgId), where('createdBy', '==', user.uid), orderBy('createdAt', 'desc'), limit(5));
    let first = true;
    return onSnapshot(
      q,
      (snap) => {
        for (const d of snap.docs) {
          const a = d.data() as AnalysisDoc;
          const before = statuses.current.get(d.id);
          statuses.current.set(d.id, a.status);
          if (first || !before || before === a.status) continue;
          // No toast when the user is already looking at this analysis — the page updates live.
          if (window.location.pathname === `/analysis/${d.id}`) continue;
          if (a.status === 'COMPLETED' || a.status === 'REVIEW_REQUIRED') {
            toast.success(a.status === 'COMPLETED' ? 'Analysis completed' : 'Analysis needs review', {
              description: a.title,
              action: { label: 'Open', onClick: () => router.push(`/analysis/${d.id}`) },
            });
          } else if (a.status === 'FAILED') {
            toast.error('Analysis failed', { description: a.title, action: { label: 'Open', onClick: () => router.push(`/analysis/${d.id}`) } });
          }
        }
        first = false;
      },
      () => undefined,
    );
  }, [user, claims.orgId, notifyCompleted, router]);

  useEffect(() => {
    if (!reviewsKey || !user || !claims.orgId) return;
    const q = query(collection(getFirebase().db, 'reviewTasks'), where('orgId', '==', claims.orgId), where('assignedTo', '==', user.uid), where('status', 'in', ['OPEN', 'IN_REVIEW']));
    return onSnapshot(q, (snap) => setAssigned({ key: reviewsKey, count: snap.size }), () => setAssigned({ key: reviewsKey, count: 0 }));
  }, [reviewsKey, user, claims.orgId]);

  return { assignedReviews: reviewsKey && assigned?.key === reviewsKey ? assigned.count : 0 };
}
