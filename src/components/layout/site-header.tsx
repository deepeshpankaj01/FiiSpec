import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MobileSiteMenu } from './mobile-site-menu';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About FiiSpec' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="rounded-md" aria-label="FiiSpec home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-navy-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'px-3')}>
            Sign in
          </Link>
          <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'px-4')}>
            Analyze a Specification
          </Link>
        </div>
        <MobileSiteMenu items={NAV} />
      </div>
    </header>
  );
}
