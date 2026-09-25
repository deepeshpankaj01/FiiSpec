'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { describedBy, Field } from '@/components/fiispec/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-provider';

const Schema = z.object({ email: z.string().trim().email('Enter a valid email address') });

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { email: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await resetPassword(email);
    } catch {
      // Do not reveal whether an account exists for this email.
    }
    setSent(true);
  });

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {sent ? (
        <div className="mt-6 flex gap-3 rounded-lg bg-success-bg p-4 text-sm text-success" role="status">
          <MailCheck className="size-5 shrink-0" aria-hidden />
          <p>If an account exists for that email, a password reset link has been sent. Check your inbox.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">Enter your account email and we’ll send a reset link.</p>
          <Field id="email" label="Email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('email', errors.email?.message)} {...form.register('email')} />
          </Field>
          <Button type="submit" size="lg" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-navy-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
