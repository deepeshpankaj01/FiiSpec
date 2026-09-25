'use client';

import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { EvidenceItem } from '@shared/analysis';
import { useAuth } from '@/features/auth/auth-provider';
import { getFirebase } from '@/lib/firebase/client';

const evidenceCache = new Map<string, Promise<EvidenceItem[]>>();

/**
 * Evidence is loaded lazily (only when a panel or the Evidence tab is opened)
 * and cached per analysis. The orgId filter is required by the security rules.
 */
export function useEvidence(analysisId: string, enabled: boolean): { items: EvidenceItem[] | null; error: string | null } {
  const { claims } = useAuth();
  const [items, setItems] = useState<EvidenceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !claims.orgId) return;
    const key = `${analysisId}`;
    let promise = evidenceCache.get(key);
    if (!promise) {
      promise = getDocs(query(collection(getFirebase().db, 'analyses', analysisId, 'evidence'), where('orgId', '==', claims.orgId))).then((snap) =>
        snap.docs.map((d) => d.data() as EvidenceItem),
      );
      evidenceCache.set(key, promise);
      promise.catch(() => evidenceCache.delete(key));
    }
    let cancelled = false;
    promise.then(
      (data) => !cancelled && setItems(data),
      () => !cancelled && setError('Evidence could not be loaded.'),
    );
    return () => {
      cancelled = true;
    };
  }, [analysisId, enabled, claims.orgId]);
  return { items, error };
}

export function invalidateEvidence(analysisId: string): void {
  evidenceCache.delete(analysisId);
}
