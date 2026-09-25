'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function MobileSiteMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'md:hidden')} aria-label="Open menu">
        <Menu />
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-navy-900 hover:bg-muted">
              {item.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <Link href="/login" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Sign in
            </Link>
            <Link href="/analysis/new" onClick={() => setOpen(false)} className={cn(buttonVariants({ size: 'lg' }))}>
              Analyze a Specification
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
