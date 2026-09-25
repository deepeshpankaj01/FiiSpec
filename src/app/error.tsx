'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Route error boundary: never shows a stack trace to users. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Technical details stay in the console for developers; users see a friendly message.
    console.error('FiiSpec route error', error.digest ?? error.name);
  }, [error]);
  return (
    <main id="main" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">This page could not be displayed. You can try again; if the problem continues, contact your administrator.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
