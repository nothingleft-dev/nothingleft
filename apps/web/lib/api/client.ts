import { ErrorEnvelopeSchema, type SuccessEnvelope } from '@nothingleft/types';
import { env } from '@lib/env';
import { ApiError, ApiNetworkError } from '@lib/api/errors';

export const REQUEST_TIMEOUT_MS = 10_000;
const GET_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const REQUEST_ID_HEADER = 'x-request-id';
const SIGN_IN_PATH = '/sign-in';
// Every route in the (auth) group. A 401 on one of these is the normal state, not a
// reason to navigate - bouncing /sign-up to /sign-in would be actively wrong.
const AUTH_PATHS = [
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/reset-password',
  '/invite',
  '/auth/',
  '/unsubscribe',
  '/transfer',
];

export type QueryValue = string | number | boolean | null | undefined;
/** An array repeats the parameter, which is how the API reads `kind` on the audit log. */
export type QueryEntry = QueryValue | readonly QueryValue[];

export interface RequestOptions {
  query?: Record<string, QueryEntry>;
  body?: unknown;
  signal?: AbortSignal;
  /** Forwarded verbatim; server components pass the incoming cookie header here. */
  headers?: Record<string, string>;
  idempotencyKey?: string | false;
  /** For a request the server answers only after calling someone else, such as a storage check. */
  timeoutMs?: number;
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler = redirectToSignIn;

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler;
}

// A full navigation on purpose: it drops every piece of in-memory state the old session owned.
export function redirectToSignIn() {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search;
  if (AUTH_PATHS.some(path => window.location.pathname.startsWith(path))) return;
  const target = new URL(SIGN_IN_PATH, window.location.origin);
  target.searchParams.set('next', here);
  window.location.assign(target.toString());
}

export function buildUrl(path: string, query?: Record<string, QueryEntry>) {
  const url = new URL(path, `${env.apiBaseUrl}/`);
  for (const [key, entry] of Object.entries(query ?? {})) {
    const values: readonly QueryValue[] = Array.isArray(entry) ? entry : [entry as QueryValue];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

function combineSignals(signals: (AbortSignal | undefined)[]) {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  return present.length === 1 ? present[0] : AbortSignal.any(present);
}

async function send<T>(method: string, path: string, opts: RequestOptions, attempt = 0): Promise<SuccessEnvelope<T>> {
  const headers = new Headers({ accept: 'application/json', ...opts.headers });
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  if (method === 'POST' && opts.idempotencyKey !== false) {
    headers.set('idempotency-key', opts.idempotencyKey ?? crypto.randomUUID());
  }

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: combineSignals([timeout, opts.signal]),
    });
  } catch (cause) {
    if (opts.signal?.aborted) throw cause;
    if (method === 'GET' && attempt < GET_RETRIES) return send(method, path, opts, attempt + 1);
    throw new ApiNetworkError(timeout.aborted ? 'timeout' : 'offline');
  }

  const requestId = response.headers.get(REQUEST_ID_HEADER);

  if (method === 'GET' && RETRYABLE_STATUSES.has(response.status) && attempt < GET_RETRIES) {
    return send(method, path, opts, attempt + 1);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiNetworkError('malformed', requestId);
  }

  if (!response.ok) {
    const parsed = ErrorEnvelopeSchema.safeParse(payload);
    const error = parsed.success
      ? ApiError.fromBody(response.status, parsed.data.error)
      : new ApiError(response.status, 'unknown', response.statusText, requestId);
    if (error.isSignedOut) onUnauthorized();
    throw error;
  }

  if (typeof payload !== 'object' || payload === null || !('data' in payload) || !('meta' in payload)) {
    throw new ApiNetworkError('malformed', requestId);
  }
  return payload as SuccessEnvelope<T>;
}

export const api = {
  get: <T>(path: string, opts: Omit<RequestOptions, 'body' | 'idempotencyKey'> = {}) => send<T>('GET', path, opts),
  post: <T>(path: string, opts: RequestOptions = {}) => send<T>('POST', path, opts),
  patch: <T>(path: string, opts: RequestOptions = {}) => send<T>('PATCH', path, opts),
  put: <T>(path: string, opts: RequestOptions = {}) => send<T>('PUT', path, opts),
  delete: <T>(path: string, opts: RequestOptions = {}) => send<T>('DELETE', path, opts),
};
