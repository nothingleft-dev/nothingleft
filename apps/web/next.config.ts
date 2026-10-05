import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // frontend-guide.md § Routes: /issues/PROJ is an alias of the project list, not a redirect.
  rewrites: async () => [{ source: '/issues/:key', destination: '/projects/:key/issues' }],
};

export default nextConfig;
