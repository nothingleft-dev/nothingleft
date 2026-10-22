import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // frontend-guide.md § Routes: /issues/PROJ is an alias of the project list, not a redirect.
  rewrites: async () => [{ source: '/issues/:key', destination: '/projects/:key/issues' }],
  // The container image only; the hosted build keeps the platform's own output.
  ...(process.env.NEXT_STANDALONE === 'true' && {
    output: 'standalone',
    outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  }),
};

export default nextConfig;
