import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <div className="flex gap-2">
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>Home</Link>
        <Link href="/dashboard" className={buttonVariants()}>Dashboard</Link>
      </div>
    </main>
  );
}
