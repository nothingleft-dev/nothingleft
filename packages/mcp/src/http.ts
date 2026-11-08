import { createMcpHandler } from '@modelcontextprotocol/server';
import type { PatScope } from '@nothingleft/types';
import { createMcpServer, type McpServerOptions } from './server.ts';
import { timeZoneCache } from './time-zones.ts';

export interface McpHttpOptions extends Omit<
  McpServerOptions,
  'token' | 'userId' | 'requestId' | 'scopes' | 'onToolCall' | 'timeZones'
> {
  onToolCall?: (event: Parameters<NonNullable<McpServerOptions['onToolCall']>>[0], caller: Caller) => void;
}

export interface Caller {
  token: string;
  userId: number;
  requestId: string;
  scopes: readonly PatScope[];
}

/**
 * Stateless Streamable HTTP: each request builds a server around the caller's PAT, so nothing
 * outlives the request and GET/DELETE (session operations) answer 405.
 */
export function mcpHttpHandler({ onToolCall, ...options }: McpHttpOptions) {
  const timeZones = timeZoneCache();
  const handler = createMcpHandler(({ authInfo }) => {
    const caller = authInfo!.extra as unknown as Caller;
    return createMcpServer({
      ...options,
      token: caller.token,
      userId: caller.userId,
      requestId: caller.requestId,
      scopes: caller.scopes,
      timeZones,
      ...(onToolCall ? { onToolCall: event => onToolCall(event, caller) } : {}),
    });
  });

  return {
    handle: (request: Request, caller: Caller, parsedBody?: unknown) =>
      handler.fetch(request, {
        authInfo: { token: caller.token, clientId: 'pat', scopes: [], extra: { ...caller } },
        ...(parsedBody !== undefined ? { parsedBody } : {}),
      }),
    close: () => handler.close(),
  };
}
