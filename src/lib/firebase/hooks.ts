'use client';

/**
 * Realtime Firestore hooks. Security rules enforce access; these hooks only
 * surface loading/error state. Queries must include the organisation filter
 * required by the rules.
 *
 * State is stored together with the key it belongs to, so "loading" is
 * derived (key mismatch) instead of being set synchronously inside effects.
 */
import { type DocumentData, doc, onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getFirebase } from './client';

export interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

interface Keyed<T> {
  key: string | null;
  data: T;
  error: string | null;
}

function describe(error: { code?: string }, what: string): string {
  return error.code === 'permission-denied' ? `You do not have access to this ${what}.` : 'Could not load data.';
}

export function useDocument<T = DocumentData>(path: string | null): Loadable<T | null> {
  const [state, setState] = useState<Keyed<T | null>>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(getFirebase().db, path),
      (snap) => setState({ key: path, data: snap.exists() ? ({ ...snap.data(), id: snap.id } as T) : null, error: null }),
      (error) => setState({ key: path, data: null, error: describe(error, 'item') }),
    );
  }, [path]);
  if (!path) return { data: null, loading: false, error: null };
  const current = state.key === path;
  return { data: current ? state.data : null, loading: !current, error: current ? state.error : null };
}

/**
 * Subscribe to a query. `key` must change whenever the query changes
 * (queries are not referentially stable). Pass `null` as the builder to disable.
 */
export function useQuery<T = DocumentData>(build: (() => Query | null) | null, key: string): Loadable<T[]> {
  const [state, setState] = useState<Keyed<T[]>>({ key: null, data: [], error: null });
  const enabled = build !== null;
  useEffect(() => {
    if (!enabled) return;
    const q = build?.() ?? null;
    if (!q) return;
    return onSnapshot(
      q,
      (snap) => setState({ key, data: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T), error: null }),
      (error) => setState({ key, data: [], error: describe(error, 'list') }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller-provided key captures query identity
  }, [key, enabled]);
  if (!enabled) return { data: [], loading: false, error: null };
  const current = state.key === key;
  return { data: current ? state.data : [], loading: !current, error: current ? state.error : null };
}
