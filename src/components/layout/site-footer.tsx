import Link from 'next/link';
import { DISCLAIMER } from '@shared/constants';
import { Logo } from '@/components/brand/logo';

export function SiteFooter() {
  return (
    <footer className="border-t bg-navy-950 text-navy-100">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo inverted />
          <p className="max-w-md text-sm text-navy-100/80">AI Standards Intelligence for Procurement. From Specification → Standards → Evidence → Procurement-Ready Decision.</p>
          <p className="max-w-md text-xs text-navy-100/60">{DISCLAIMER}</p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Product</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/how-it-works">How it works</Link></li>
            <li><Link className="hover:text-white" href="/analysis/new">Analyze a specification</Link></li>
            <li><Link className="hover:text-white" href="/standards">Explore standards</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">About</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/about">About FiiSpec</Link></li>
            <li><Link className="hover:text-white" href="/about#data">Data &amp; honesty policy</Link></li>
            <li><Link className="hover:text-white" href="/about#security">Security</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-4 text-xs text-navy-100/60 sm:flex-row sm:items-center sm:justify-between">
          <span>Prototype built for Smart India Hackathon 2026 · Problem Statement SIH26108</span>
          <span>Standards data: curated benchmark subset — not complete BIS coverage</span>
        </div>
      </div>
    </footer>
  );
}
