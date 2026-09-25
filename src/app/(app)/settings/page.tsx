'use client';

import { collection, doc, onSnapshot, query } from 'firebase/firestore';
import { Building2, KeyRound, LogOut, RefreshCw, Shield, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ORGANIZATION_TYPE_LABELS } from '@shared/api';
import type { OrgAssignableRole, UserRole } from '@shared/constants';
import { ORG_ASSIGNABLE_ROLES, ROLE_LABELS, UI_LANGUAGES } from '@shared/constants';
import { Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/auth-provider';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useDocument, useQuery } from '@/lib/firebase/hooks';

interface Member {
  id: string;
  uid: string;
  displayName: string;
  email: string | null;
  role: UserRole;
}

function Section({ icon: Icon, title, description, children }: { icon: typeof User; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <Icon className="mt-0.5 size-5 text-saffron-500" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileSection() {
  const { profile } = useAuth();
  if (!profile) return <Section icon={User} title="Profile, language and notifications"><p className="text-sm text-muted-foreground">Loading profile…</p></Section>;
  // Keyed by user so the form initialises once from the stored profile.
  return <ProfileForm key={profile.uid} profile={profile} />;
}

function ProfileForm({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [name, setName] = useState(profile.displayName);
  const [language, setLanguage] = useState<'en' | 'hi'>(profile.language ?? 'en');
  const [analysisCompleted, setAnalysisCompleted] = useState(profile.notifications?.analysisCompleted ?? true);
  const [reviewAssigned, setReviewAssigned] = useState(profile.notifications?.reviewAssigned ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateProfile({ displayName: name.trim(), language, notifications: { analysisCompleted, reviewAssigned } });
      toast.success('Settings saved.');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={User} title="Profile, language and notifications">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="profile-name" label="Name">
          <Input id="profile-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="profile-language" label="Interface language" hint="Analysis input already accepts English, Hindi and Hinglish. Hindi interface translation is planned.">
          <NativeSelect id="profile-language" value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}>
            {UI_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="mt-5 space-y-3">
        <legend className="text-sm font-medium text-navy-900">In-app notifications</legend>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Notify me when my analyses complete
            <span className="block text-xs text-muted-foreground">Shown as a notification while you are signed in.</span>
          </span>
          <Switch checked={analysisCompleted} onCheckedChange={setAnalysisCompleted} aria-label="Notify me when my analyses complete" />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Show review tasks assigned to me
            <span className="block text-xs text-muted-foreground">A count appears next to Reviews in the navigation.</span>
          </span>
          <Switch checked={reviewAssigned} onCheckedChange={setReviewAssigned} aria-label="Show review tasks assigned to me" />
        </label>
      </fieldset>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => void save()} disabled={busy || name.trim().length < 2}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Section>
  );
}

function OrganizationSection() {
  const { claims, user } = useAuth();
  const orgId = claims.orgId!;
  const org = useDocument<{ name: string; type: keyof typeof ORGANIZATION_TYPE_LABELS; memberCount: number }>(`organizations/${orgId}`);
  const members = useQuery<Member>(() => query(collection(getFirebase().db, 'organizations', orgId, 'members')), `members-${orgId}`);
  const canManage = claims.role === 'PROCUREMENT_OFFICER' || claims.role === 'ADMIN';
  const [joinCode, setJoinCode] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    return onSnapshot(
      doc(getFirebase().db, 'organizations', orgId, 'private', 'settings'),
      (snap) => setJoinCode((snap.data()?.joinCode as string | undefined) ?? null),
      () => setJoinCode(null),
    );
  }, [canManage, orgId]);

  const changeRole = async (userId: string, role: OrgAssignableRole) => {
    try {
      await api.updateMemberRole({ userId, role });
      toast.success('Role updated. The member will see the change on their next action.');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <Section icon={Building2} title="Organisation" description="Analyses are shared with members of your organisation only.">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Name</dt>
          <dd className="font-medium">{org.data?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Type</dt>
          <dd>{org.data ? ORGANIZATION_TYPE_LABELS[org.data.type] : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Your role</dt>
          <dd>{claims.role ? ROLE_LABELS[claims.role] : '—'}</dd>
        </div>
      </dl>

      {canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg bg-muted/60 p-3 text-sm">
          <KeyRound className="size-4 text-navy-700" aria-hidden />
          <span>
            Join code: <span className="font-mono font-semibold tracking-wider">{joinCode ?? '…'}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await api.regenerateJoinCode({});
                toast.success('A new join code was generated. The old code no longer works.');
              } catch (e) {
                toast.error(friendlyError(e));
              }
            }}
          >
            <RefreshCw aria-hidden /> Regenerate
          </Button>
          <span className="text-xs text-muted-foreground">Share it with colleagues so they can join as Organization Users.</span>
        </div>
      ) : null}

      <h3 className="mb-2 mt-5 text-sm font-semibold">Members ({members.data.length})</h3>
      <ul className="divide-y rounded-lg border">
        {members.data.map((m) => (
          <li key={m.uid} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {m.displayName} {m.uid === user?.uid ? <span className="text-xs text-muted-foreground">(you)</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            {canManage && m.uid !== user?.uid && m.role !== 'ADMIN' ? (
              <div className="w-52">
                <NativeSelect aria-label={`Role for ${m.displayName}`} value={m.role} onChange={(e) => void changeRole(m.uid, e.target.value as OrgAssignableRole)}>
                  {ORG_ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{ROLE_LABELS[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SecuritySection() {
  const { user, resetPassword, signOut } = useAuth();
  const router = useRouter();
  const providers = user?.providerData.map((p) => (p.providerId === 'password' ? 'Email and password' : p.providerId === 'google.com' ? 'Google' : p.providerId)) ?? [];
  return (
    <Section icon={Shield} title="Security">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="font-medium">{user?.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sign-in methods</dt>
          <dd>{providers.join(', ') || '—'}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">FiiSpec stores only your name, email, organisation and role. Access to your organisation’s data is enforced by server-side security rules.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {user?.email && providers.includes('Email and password') ? (
          <Button
            variant="outline"
            onClick={async () => {
              await resetPassword(user.email!).catch(() => undefined);
              toast.success('Password reset email sent.');
            }}
          >
            <KeyRound aria-hidden /> Send password reset email
          </Button>
        ) : null}
        <Button
          variant="destructive"
          onClick={async () => {
            await signOut();
            router.replace('/');
          }}
        >
          <LogOut aria-hidden /> Log out
        </Button>
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" />
      <ProfileSection />
      <OrganizationSection />
      <SecuritySection />
    </div>
  );
}
