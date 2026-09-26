import path from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

const nextConfig: NextConfig = {
  // The repository root; prevents Turbopack from picking up lockfiles outside the project.
  turbopack: { root: path.resolve('.') },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', '@xyflow/react'],
  },
  // Server API dependencies (server/src) that read their own files at runtime; loaded with require() instead of bundled.
  serverExternalPackages: ['pdfkit', 'mammoth', 'unpdf', 'docx'],
  outputFileTracingIncludes: {
    // pdfkit loads its standard-font metrics (.afm) from disk when rendering PDF exports.
    '/api/fn/*': ['./node_modules/pdfkit/js/data/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
