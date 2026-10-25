import type { GitFetch } from '@git/http';

export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export type FakeReply =
  | unknown
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | ((call: FakeCall) => { status: number; body?: unknown; headers?: Record<string, string> });

const isReply = (v: unknown): v is { status: number; body?: unknown; headers?: Record<string, string> } =>
  typeof v === 'object' && v !== null && 'status' in v && typeof (v as { status: unknown }).status === 'number';

/**
 * A provider API in a test: `routes` maps `METHOD https://host/path` (query ignored) to a JSON
 * body or a full reply. Anything unrouted answers 599, so a test never reaches the network.
 */
export function fakeFetch(routes: Record<string, FakeReply> = {}) {
  const calls: FakeCall[] = [];
  const fetch: GitFetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => (headers[name] = value));
    const call = { method, url: input, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const key = `${method} ${url.origin}${url.pathname}`;
    const route = routes[key];
    if (route === undefined) return new Response(JSON.stringify({ message: `unrouted ${key}` }), { status: 599 });
    const reply = typeof route === 'function' ? route(call) : isReply(route) ? route : { status: 200, body: route };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  };
  return { fetch, calls, routes };
}
