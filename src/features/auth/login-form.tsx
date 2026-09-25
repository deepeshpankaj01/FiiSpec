'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { describedBy, Field } from '@/components/fiispec/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/firebase/callables';
import { USE_EMULATORS } from '@/lib/firebase/client';
import { useAuth } from './auth-provider';
import { GoogleButton } from './google-button';

const Schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof Schema>;

/** Only allow same-origin relative redirects. */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

const DEMO_ACCOUNTS = [
  ['Procurement Officer', 'officer@fiispec.demo'],
  ['Reviewer', 'reviewer@fiispec.demo'],
  ['Administrator', 'admin@fiispec.demo'],
];

export function LoginForm() {
  const { signIn, user, loading } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await signIn(values.email, values.password);
      router.replace(next);
    } catch (e) {
      setError(friendlyError(e));
    }
  });

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Access your organisation’s analyses and standards intelligence.</p>

      {error ? (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('email', errors.email?.message)} {...form.register('email')} />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" className="h-10" aria-invalid={Boolean(errors.password)} aria-describedby={describedBy('password', errors.password?.message)} {...form.register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-navy-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton onDone={() => router.replace(next)} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to FiiSpec?{' '}
        <Link href={`/register${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-navy-700 hover:underline">
          Create an account
        </Link>
      </p>

      {USE_EMULATORS ? (
        <div className="mt-6 rounded-lg border border-dashed bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-navy-900">Local demo accounts (emulator only)</p>
          <ul className="mt-1 space-y-1">
            {DEMO_ACCOUNTS.map(([role, email]) => (
              <li key={email}>
                <button
                  type="button"
                  className="text-left hover:text-navy-900 hover:underline"
                  onClick={() => {
                    form.setValue('email', email);
                    form.setValue('password', 'FiiSpec#2026');
                  }}
                >
                  {role}: {email}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Password: FiiSpec#2026</p>
        </div>
      ) : null}
    </div>
  );
}
