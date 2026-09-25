import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'FiiSpec — AI Standards Intelligence for Procurement', template: '%s · FiiSpec' },
  description:
    'FiiSpec turns product and tender specifications into evidence-backed standards intelligence: applicable Indian Standards, connected requirements, versions, certification context and specification gaps.',
  applicationName: 'FiiSpec',
};

export const viewport: Viewport = {
  themeColor: '#0b2545',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-navy-900 focus:shadow">
          Skip to main content
        </a>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
