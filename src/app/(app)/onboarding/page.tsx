'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, KeyRound, LogOut } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CreateOrganizationSchema, JoinOrganizationSchema, ORGANIZATION_TYPE_LABELS } from '@shared/api';
import { Logo } from '@/components/brand/logo';
import { describedBy, Field } from '@/components/fiispec/field';
import { NativeSelect } from '@/components/fiispec/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-provider';
import { safeNext } from '@/features/auth/login-form';
import { api, friendlyError } from '@/lib/firebase/callables';

function Onboarding() {
  const { claims, refreshClaims, signOut, profile } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [joining, setJoining] = useState(false);
  const create = useForm<z.input<typeof CreateOrganizationSchema>>({ resolver: zodResolver(CreateOrganizationSchema), defaultValues: { name: '', type: 'GOVERNMENT_DEPARTMENT' } });
  const join = useForm<z.input<typeof JoinOrganizationSchema>>({ resolver: zodResolver(JoinOrganizationSchema), defaultValues: { joinCode: '' } });

  useEffect(() => {
    if (claims.orgId) router.replace(next);
  }, [claims.orgId, next, router]);

  const finish = async (message: string) => {
    await refreshClaims();
    toast.success(message);
    router.replace(next);
  };

  const onCreate = create.handleSubmit(async (values) => {
    try {
      await api.createOrganization(CreateOrganizationSchema.parse(values));
      await finish('Organisation created. You are its procurement officer.');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  });

  const onJoin = join.handleSubmit(async (values) => {
    setJoining(true);
    try {
      await api.joinOrganization(JoinOrganizationSchema.parse(values));
      await finish('You have joined the organisation.');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setJoining(false);
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-50/80 to-white">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo />
        <Button variant="ghost" onClick={() => void signOut().then(() => router.replace('/'))}>
          <LogOut aria-hidden /> Sign out
        </Button>
      </header>
      <div className="container-page max-w-4xl py-10">
        <h1 className="text-2xl font-semibold sm:text-3xl">Welcome{profile?.displayName ? `, ${profile.displayName.split(' ')[0]}` : ''}</h1>
        <p className="mt-2 text-muted-foreground">FiiSpec keeps analyses private to your organisation. Create an organisation, or join an existing one with the code your procurement officer shared.</p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <form onSubmit={onCreate} noValidate className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-saffron-500" aria-hidden />
              <h2 className="text-lg font-semibold">Create an organisation</h2>
            </div>
            <Field id="org-name" label="Organisation name" error={create.formState.errors.name?.message}>
              <Input id="org-name" placeholder="e.g. Municipal Corporation — Electrical Division" className="h-10" aria-invalid={Boolean(create.formState.errors.name)} aria-describedby={describedBy('org-name', create.formState.errors.name?.message)} {...create.register('name')} />
            </Field>
            <Field id="org-type" label="Organisation type">
              <NativeSelect id="org-type" {...create.register('type')}>
                {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <p className="text-xs text-muted-foreground">You will become the organisation’s Procurement Officer and can invite colleagues with a join code.</p>
            <Button type="submit" size="lg" className="h-10 w-full" disabled={create.formState.isSubmitting}>
              {create.formState.isSubmitting ? 'Creating…' : 'Create organisation'}
            </Button>
          </form>

          <form onSubmit={onJoin} noValidate className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="size-5 text-saffron-500" aria-hidden />
              <h2 className="text-lg font-semibold">Join with a code</h2>
            </div>
            <Field id="join-code" label="Join code" hint="Looks like ABCD-1234. Ask your procurement officer." error={join.formState.errors.joinCode?.message}>
              <Input id="join-code" placeholder="ABCD-1234" className="h-10 font-mono uppercase" autoComplete="off" aria-invalid={Boolean(join.formState.errors.joinCode)} aria-describedby={describedBy('join-code', join.formState.errors.joinCode?.message, true)} {...join.register('joinCode')} />
            </Field>
            <p className="text-xs text-muted-foreground">You will join as an Organization User. Officers can change your role later.</p>
            <Button type="submit" variant="outline" size="lg" className="h-10 w-full" disabled={joining}>
              {joining ? 'Joining…' : 'Join organisation'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
