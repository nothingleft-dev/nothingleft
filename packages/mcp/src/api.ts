import { MCP_CLIENT_HEADER } from '@nothingleft/types';
import { ToolError, type ToolErrorBody } from './errors.ts';

export type Fetch = (input: Request) => Promise<Response>;

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  next_cursor?: string | null;
  has_more: boolean;
}

export interface ApiResult<T> {
  data: T;
  pagination?: Pagination;
  meta?: Record<string, unknown>;
}

type Query = Record<string, string | number | boolean | undefined>;

export interface ApiClient {
  get<T>(path: string, options?: { query?: Query; org?: string }): Promise<ApiResult<T>>;
  send<T>(
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    options?: { body?: object; query?: Query; org?: string },
  ): Promise<ApiResult<T>>;
  /** Where a redirecting GET points, without following it: the files route's presigned URL. */
  location(path: string): Promise<string>;
  /** A PUT to a presigned storage URL the API issued. Carries only the signed headers, never the token. */
  upload(url: string, headers: Record<string, string>, body: Uint8Array<ArrayBuffer>): Promise<void>;
  readonly calls: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  fetch: Fetch;
  /** The MCP request's id, so one tool call's API requests share it in the logs. */
  requestId?: string;
}

const segment = (value: string) => encodeURIComponent(value);
export const path = (strings: TemplateStringsArray, ...values: string[]) =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? segment(values[i]!) : ''), '');

/** The public REST API over HTTP, as the token's owner. The only way a tool reaches data. */
export function apiClient({ baseUrl, token, fetch, requestId }: ApiClientOptions): ApiClient {
  let calls = 0;

  function headersFor(method: string, org: string | undefined, body: boolean) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      [MCP_CLIENT_HEADER]: 'mcp',
    };
    if (body) headers['content-type'] = 'application/json';
    if (org) headers['x-organization'] = org;
    if (requestId) headers['x-request-id'] = requestId;
    // One key per write, reused by the retry below: agents retry, and a replay must not double a write.
    if (method !== 'GET') headers['idempotency-key'] = crypto.randomUUID();
    return headers;
  }

  async function exchange(url: string, init: RequestInit): Promise<Response> {
    try {
      calls++;
      return await fetch(new Request(url, init));
    } catch {
      try {
        calls++;
        return await fetch(new Request(url, init));
      } catch {
        throw ToolError.local('mcp.api_unreachable');
      }
    }
  }

  async function request<T>(
    method: string,
    route: string,
    { query, body, org }: { query?: Query; body?: object; org?: string },
  ): Promise<ApiResult<T>> {
    const url = new URL(route, baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers = headersFor(method, org, body !== undefined);
    const response = await exchange(url.href, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });

    const payload = await envelope<T>(response);
    if (!response.ok || !payload || !('data' in payload)) {
      throw ToolError.local('mcp.unexpected_response', { status: response.status });
    }
    const { pagination, ...meta } = payload.meta ?? {};
    return { data: payload.data as T, ...(pagination ? { pagination } : {}), meta };
  }

  async function envelope<T>(response: Response) {
    const payload = (await response.json().catch(() => null)) as {
      data?: T;
      meta?: { pagination?: Pagination } & Record<string, unknown>;
      error?: ToolErrorBody;
    } | null;
    if (payload?.error) throw new ToolError(payload.error);
    return payload;
  }

  return {
    get: (route, options = {}) => request('GET', route, options),
    send: (method, route, options = {}) => request(method, route, options),
    async location(route) {
      const url = new URL(route, baseUrl);
      const response = await exchange(url.href, {
        method: 'GET',
        headers: headersFor('GET', undefined, false),
        redirect: 'manual',
      });
      const target = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && target) return target;
      await envelope(response);
      throw ToolError.local('mcp.unexpected_response', { status: response.status });
    },
    async upload(url, headers, body) {
      const response = await exchange(url, { method: 'PUT', headers, body });
      if (!response.ok) throw ToolError.local('mcp.upload_failed', { status: response.status });
    },
    get calls() {
      return calls;
    },
  };
}
