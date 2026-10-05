import type { FastifyRequest } from 'fastify';

const COUNTRY_HEADERS = ['x-vercel-ip-country', 'cf-ipcountry'];
const TIMEZONE_HEADER = 'x-vercel-ip-timezone';

export interface RequestFacts {
  ip: string;
  user_agent: string | null;
  country_code: string | null;
}

// Fastify lists more than the socket address only when it trusted the socket's own address.
const fromTrustedProxy = (request: FastifyRequest): boolean => (request.ips?.length ?? 1) > 1;

const header = (request: FastifyRequest, name: string): string | null => {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

export function requestFacts(request: FastifyRequest): RequestFacts {
  const country = fromTrustedProxy(request)
    ? (COUNTRY_HEADERS.map(h => header(request, h)).find(Boolean) ?? null)
    : null;
  return {
    ip: request.ip,
    user_agent: header(request, 'user-agent'),
    country_code: country ? country.slice(0, 2).toUpperCase() : null,
  };
}

// The browser posts its own IANA zone; the edge header is only the fallback for the
// first request — docs/auth-and-tenancy.md#login-methods.
export function resolveTimezone(request: FastifyRequest, supplied?: string): string {
  return supplied ?? (fromTrustedProxy(request) ? header(request, TIMEZONE_HEADER) : null) ?? 'UTC';
}

/** `X-Organization: <slug>` — how a PAT names its organisation. Sessions ignore it. */
export function orgHints(request: FastifyRequest): { slug?: string } {
  const slug = header(request, 'x-organization');
  return slug ? { slug } : {};
}
