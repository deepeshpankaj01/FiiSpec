'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { describedBy, Field } from '@/components/fiispec/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyError } from '@/lib/firebase/callables';
import { useAuth } from './auth-provider';
import { GoogleButton } from './google-button';
import { safeNext } from './login-form';

const Schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(80),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof Schema>;

export function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { name: '', email: '', password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await register(v.name, v.email, v.password);
      router.replace(`/onboarding?next=${encodeURIComponent(next)}`);
    } catch (e) {
      setError(friendlyError(e));
    }
  });

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">You will create or join your organisation next.</p>
      {error ? (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Field id="name" label="Full name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" className="h-10" aria-invalid={Boolean(errors.name)} aria-describedby={describedBy('name', errors.name?.message)} {...form.register('name')} />
        </Field>
        <Field id="email" label="Work email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('email', errors.email?.message)} {...form.register('email')} />
        </Field>
        <Field id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" className="h-10" aria-invalid={Boolean(errors.password)} aria-describedby={describedBy('password', errors.password?.message, true)} {...form.register('password')} />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" className="h-10" aria-invalid={Boolean(errors.confirm)} aria-describedby={describedBy('confirm', errors.confirm?.message)} {...form.register('confirm')} />
        </Field>
        <p className="text-xs text-muted-foreground">We store only your name, email, organisation and role.</p>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton onDone={() => router.replace(`/onboarding?next=${encodeURIComponent(next)}`)} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-navy-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
