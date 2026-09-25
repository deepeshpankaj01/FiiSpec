'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-provider';
import { cn } from '@/lib/utils';

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/standards', label: 'Standards' },
  { href: '/admin/relationships', label: 'Relationships' },
  { href: '/admin/amendments', label: 'Amendments' },
  { href: '/admin/certification-rules', label: 'Certification rules' },
  { href: '/admin/ingestion', label: 'Ingestion' },
  { href: '/admin/benchmarks', label: 'Benchmark cases' },
  { href: '/admin/reviews', label: 'Reviews & feedback' },
  { href: '/admin/audit-logs', label: 'Audit logs' },
  { href: '/admin/health', label: 'System health' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { claims } = useAuth();
  const pathname = usePathname();
  if (claims.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-danger" aria-hidden />
        <h1 className="text-xl font-semibold">Administrator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">The admin console is available only to platform administrators. Access is enforced by server-side rules as well.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <p className="eyebrow mb-1">Administration</p>
        <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-1 border-b">
            {ADMIN_NAV.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn('-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap', active ? 'border-saffron-500 text-navy-900' : 'border-transparent text-muted-foreground hover:text-navy-900')}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {children}
    </div>
  );
}
