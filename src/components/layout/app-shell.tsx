'use client';

import {
  BookOpen,
  ClipboardCheck,
  FileDown,
  FilePlus2,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { ROLE_LABELS } from '@shared/constants';
import { Logo, LogoMark } from '@/components/brand/logo';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-provider';
import { useInAppNotifications } from '@/features/auth/use-in-app-notifications';
import { USE_EMULATORS } from '@/lib/firebase/client';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analysis/new', label: 'New Analysis', icon: FilePlus2 },
  { href: '/analyses', label: 'My Analyses', icon: FolderOpen },
  { href: '/standards', label: 'Standards', icon: BookOpen },
  { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { href: '/reports', label: 'Reports', icon: FileDown },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_NAV = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[3]!];

function isActive(pathname: string, href: string): boolean {
  if (href === '/analysis/new') return pathname === href;
  if (href === '/analyses') return pathname === '/analyses' || (pathname.startsWith('/analysis/') && pathname !== '/analysis/new');
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, isAdmin, onNavigate, badges }: { pathname: string; isAdmin: boolean; onNavigate?: () => void; badges: Record<string, number> }) {
  const items = isAdmin ? [...NAV, { href: '/admin', label: 'Admin', icon: ShieldCheck }] : NAV;
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-navy-900 text-white' : 'text-navy-100/85 hover:bg-white/10 hover:text-white',
              )}
            >
              <item.icon className="size-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badges[item.href] ? (
                <span className="rounded-full bg-saffron-500 px-1.5 text-[11px] font-semibold text-white" aria-label={`${badges[item.href]} assigned to you`}>
                  {badges[item.href]}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <LogoMark className="size-10 animate-pulse" />
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, claims, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isOnboarding = pathname === '/onboarding';
  const { assignedReviews } = useInAppNotifications();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!claims.orgId && !isOnboarding) router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, claims.orgId, isOnboarding, pathname, router]);

  if (loading || !user) return <FullScreenLoading />;
  if (!claims.orgId && !isOnboarding) return <FullScreenLoading />;
  if (isOnboarding) return <main id="main" className="flex-1">{children}</main>;

  const isAdmin = claims.role === 'ADMIN';
  const displayName = profile?.displayName ?? user.displayName ?? user.email ?? 'Account';

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-950 px-3 py-4">
      <Link href="/dashboard" className="mb-6 px-2" aria-label="FiiSpec dashboard">
        <Logo inverted />
      </Link>
      <nav aria-label="Application" className="flex-1">
        <NavLinks pathname={pathname} isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} badges={{ '/reviews': assignedReviews }} />
      </nav>
      <div className="mt-4 rounded-lg bg-white/5 p-3 text-xs text-navy-100/80">
        <p className="font-semibold text-white">{profile?.orgName ?? 'Your organisation'}</p>
        <p>{claims.role ? ROLE_LABELS[claims.role] : ''}</p>
        {USE_EMULATORS ? <p className="mt-2 text-saffron-100">Local emulator environment</p> : null}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'lg:hidden')} aria-label="Open navigation">
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-0 p-0" showCloseButton={false}>
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                {sidebar}
              </SheetContent>
            </Sheet>
            <Link href="/dashboard" className="lg:hidden" aria-label="Dashboard">
              <LogoMark className="size-7" />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/analysis/new" className={cn(buttonVariants({ size: 'default' }), 'hidden sm:inline-flex')}>
              <FilePlus2 aria-hidden /> New Analysis
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-2" />}>
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white" aria-hidden>
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{displayName}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings aria-hidden /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    router.replace('/');
                  }}
                >
                  <LogOut aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-white lg:hidden">
          <ul className="grid grid-cols-4">
            {MOBILE_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-navy-900' : 'text-muted-foreground')}>
                    <item.icon className={cn('size-5', active && 'text-saffron-500')} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
