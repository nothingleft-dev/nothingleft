import { isPublicUrl, type ResolveHost } from '@lib/network';

export type GitFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type GitProviderFailure =
  'unreachable' | 'rate_limited' | 'token_invalid' | 'forbidden' | 'not_found' | 'invalid';

/** A provider call that did not succeed. Never carries the request's credentials or the response body. */
export class GitProviderError extends Error {
  constructor(
    readonly reason: GitProviderFailure,
    readonly status: number | null = null,
    /** For `rate_limited`: when the provider says the limit resets. */
    readonly resetAt: Date | null = null,
  ) {
    super(`git provider request failed: ${reason}${status ? ` (${status})` : ''}`);
  }
}

export interface GitResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

export interface GitRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined> | undefined;
}

const TIMEOUT_MS = 15_000;
const RESPONSE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Every provider request checks its host first, so a self-managed base URL that resolves to a
 * private address (or starts to, later) is never reached unless the server allows it.
 */
export function guardedFetch(fetch: GitFetch, resolve: ResolveHost, allowPrivate: boolean): GitFetch {
  if (allowPrivate) return fetch;
  return async (input, init) => {
    if (!(await isPublicUrl(input, resolve))) throw new GitProviderError('unreachable');
    return fetch(input, init);
  };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new GitProviderError('invalid');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function withQuery(url: string, query: GitRequest['query']): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

function resetFrom(headers: Headers, now: Date): Date | null {
  const epoch = headers.get('x-ratelimit-reset') ?? headers.get('ratelimit-reset');
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000);
  const retry = headers.get('retry-after');
  if (retry && /^\d+$/.test(retry)) return new Date(now.getTime() + Number(retry) * 1000);
  return null;
}

/** One JSON request to a provider's API, its failures mapped to a `GitProviderError`. */
export async function gitRequest<T>(fetch: GitFetch, url: string, req: GitRequest = {}): Promise<GitResponse<T>> {
  let res: Response;
  try {
    res = await fetch(withQuery(url, req.query), {
      method: req.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(req.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...req.headers,
      },
      ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    });
  } catch {
    throw new GitProviderError('unreachable');
  }
  if (res.ok) {
    const text = await readCapped(res);
    let data: T;
    try {
      data = (text ? JSON.parse(text) : null) as T;
    } catch {
      throw new GitProviderError('invalid', res.status);
    }
    return { status: res.status, data, headers: res.headers };
  }
  const exhausted = res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('ratelimit-remaining') === '0';
  if (res.status === 429 || (res.status === 403 && exhausted)) {
    throw new GitProviderError('rate_limited', res.status, resetFrom(res.headers, new Date()));
  }
  if (res.status === 401) throw new GitProviderError('token_invalid', 401);
  if (res.status === 403) throw new GitProviderError('forbidden', 403);
  if (res.status === 404) throw new GitProviderError('not_found', 404);
  if (res.status === 422 || res.status === 400) throw new GitProviderError('invalid', res.status);
  throw new GitProviderError('unreachable', res.status);
}

/**
 * The `rel="next"` URL of a `Link` header, which both providers page by. One on another origin
 * than `from` is refused: following it would send the connection's token elsewhere.
 */
export function nextLink(headers: Headers, from: string): string | null {
  const link = headers.get('link');
  if (!link) return null;
  for (const part of link.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (!match) continue;
    if (new URL(match[1]!).origin !== new URL(from).origin) throw new GitProviderError('invalid');
    return match[1]!;
  }
  return null;
}

const PAGES_MAX = 100;
const PAGINATION_DEADLINE_MS = 120_000;

/**
 * One pagination's budget: a page cap, no page twice, and a deadline, so a provider that answers
 * with endless (or cyclic) `next` links cannot keep a request or a worker busy for ever.
 */
export function pageBudget(): (url: string) => boolean {
  const seen = new Set<string>();
  const started = Date.now();
  return url => {
    if (seen.has(url) || seen.size >= PAGES_MAX || Date.now() - started > PAGINATION_DEADLINE_MS) return false;
    seen.add(url);
    return true;
  };
}

/** Follows `Link` pages until `limit` items or the last page; `pick` takes the items from a page. */
export async function gitPages<P, T>(
  fetch: GitFetch,
  url: string,
  req: GitRequest,
  pick: (page: P) => T[],
  limit: number,
): Promise<{ items: T[]; complete: boolean }> {
  const items: T[] = [];
  const more = pageBudget();
  let next: string | null = withQuery(url, req.query);
  while (next && items.length < limit && more(next)) {
    const res: GitResponse<P> = await gitRequest<P>(fetch, next, { ...req, query: undefined });
    items.push(...pick(res.data));
    next = nextLink(res.headers, next);
  }
  return { items: items.slice(0, limit), complete: next === null && items.length <= limit };
}
