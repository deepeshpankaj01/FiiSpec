'use client';

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { UserRole } from '@shared/constants';
import { USER_ROLES } from '@shared/constants';
import { api } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  orgId: string | null;
  orgName: string | null;
  role: UserRole | null;
  language: 'en' | 'hi';
  notifications: { analysisCompleted: boolean; reviewAssigned: boolean };
  claimsUpdatedAt: string | null;
}

export interface Claims {
  role: UserRole | null;
  orgId: string | null;
}

interface AuthState {
  user: User | null;
  claims: Claims;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshClaims: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const EMPTY_CLAIMS: Claims = { role: null, orgId: null };

function parseClaims(raw: Record<string, unknown>): Claims {
  const role = typeof raw.role === 'string' && (USER_ROLES as readonly string[]).includes(raw.role) ? (raw.role as UserRole) : null;
  const orgId = typeof raw.orgId === 'string' && raw.orgId ? raw.orgId : null;
  return { role, orgId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Claims>(EMPTY_CLAIMS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastClaimsUpdate = useRef<string | null>(null);
  const bootstrapped = useRef<string | null>(null);

  const refreshClaims = useCallback(async () => {
    const current = getFirebase().auth.currentUser;
    if (!current) return;
    const token = await current.getIdTokenResult(true);
    setClaims(parseClaims(token.claims));
  }, []);

  useEffect(() => {
    const { auth } = getFirebase();
    return onIdTokenChanged(auth, async (next) => {
      setUser(next);
      if (!next) {
        setClaims(EMPTY_CLAIMS);
        setProfile(null);
        setLoading(false);
        return;
      }
      const token = await next.getIdTokenResult();
      setClaims(parseClaims(token.claims));
      if (bootstrapped.current !== next.uid) {
        bootstrapped.current = next.uid;
        try {
          await api.bootstrapProfile({});
        } catch {
          // Profile creation is retried on next sign-in; the app still works from claims.
        }
      }
      setLoading(false);
    });
  }, []);

  // Live profile; when the server changes role/organisation it bumps claimsUpdatedAt, and we refresh the token.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(getFirebase().db, 'users', user.uid), (snap) => {
      const data = snap.data() as UserProfile | undefined;
      setProfile(data ?? null);
      if (data?.claimsUpdatedAt && data.claimsUpdatedAt !== lastClaimsUpdate.current) {
        const first = lastClaimsUpdate.current === null;
        lastClaimsUpdate.current = data.claimsUpdatedAt;
        if (!first || data.role !== claims.role || data.orgId !== claims.orgId) void refreshClaims();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per user
  }, [user?.uid]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      claims,
      profile,
      loading,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(getFirebase().auth, email, password);
      },
      signInWithGoogle: async () => {
        await signInWithPopup(getFirebase().auth, new GoogleAuthProvider());
      },
      register: async (name, email, password) => {
        const cred = await createUserWithEmailAndPassword(getFirebase().auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await cred.user.getIdToken(true);
        bootstrapped.current = null;
        await api.bootstrapProfile({});
      },
      resetPassword: async (email) => {
        await sendPasswordResetEmail(getFirebase().auth, email);
      },
      signOut: async () => {
        await firebaseSignOut(getFirebase().auth);
      },
      refreshClaims,
    }),
    [user, claims, profile, loading, refreshClaims],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
