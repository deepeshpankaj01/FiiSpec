import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Providers } from '../providers';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-navy-50/80 to-white">
        <header className="container-page flex h-16 items-center">
          <Link href="/" aria-label="FiiSpec home">
            <Logo />
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </Providers>
  );
}
