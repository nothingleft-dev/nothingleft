import type { z } from 'zod';
import type { Organization, PatScope } from '@nothingleft/types';
import type { ApiClient } from './api.ts';
import { clientRef } from './args.ts';

export interface ToolContext {
  api: ApiClient;
  appBaseUrl: string;
  /** Every organisation the token's owner belongs to, fetched once per tool call. */
  organizations: () => Promise<Organization[]>;
  /** The token owner's IANA timezone, which every instant in a result is rendered in. */
  timeZone: () => Promise<string>;
  /** After the owner changes it, so later calls do not render in the old one. */
  rememberTimeZone: (zone: string) => void;
  /** Lookups one call makes more than once - a project's organisation, a member list - kept for that call only. */
  memo: <T>(key: string, load: () => Promise<T>) => Promise<T>;
}

export interface ToolResult {
  markdown: string;
}

export type ToolKind = 'read' | 'write' | 'destructive';

/** An operation as `docs/openapi.yaml` names it, e.g. `GET /v1/issues/{key}`: the parity check matches on it. */
export type Endpoint = `${'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'} /${string}`;

export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  kind: ToolKind;
  endpoints: readonly Endpoint[];
  /**
   * What a token needs before the tool is offered: every entry, where a list entry is any one of
   * its scopes. Default: issues:read for a read, plus issues:write otherwise, since writes resolve
   * names through reads first. A test replays each call holding only these.
   */
  scopes?: readonly ScopeNeed[];
  /**
   * Adds a new record on every call. A retry with the same arguments, or the same `client_ref`,
   * within the API's MCP replay window answers with the first call's result instead of adding another.
   */
  creates?: true;
  /** A destructive tool whose repeat changes something again (a new invite link each time). */
  repeatable?: true;
  /** A destructive tool that deletes only on some calls: whether this one does. Absent, every call does. */
  deletes?: (args: z.output<S>) => boolean;
  /** Destructive tools: what the call would do, put to the person before it runs. */
  describeAction?: (ctx: ToolContext, args: z.output<S>) => Promise<string>;
  run: (ctx: ToolContext, args: z.output<S>) => Promise<ToolResult>;
}

export const defineTool = <S extends z.ZodObject>(tool: ToolDefinition<S>): ToolDefinition<S> =>
  tool.creates ? { ...tool, input: tool.input.extend({ client_ref: clientRef }) as unknown as S } : tool;

/** Why an operation has no tool; `x-mcp-exempt` in docs/openapi.yaml names one (mcp.md § Deliberately UI-only). */
export const EXEMPT_CATEGORIES = [
  'credentials',
  'session',
  'invitee',
  'download',
  'editor',
  'avatar',
  'infrastructure',
  'email_link',
  'lifecycle',
  'byo_storage',
  'integration_inbound',
] as const;

export type ScopeNeed = PatScope | readonly PatScope[];

/** Tools any token may call: they act on the caller alone or only read who they are. */
export const ANY_SCOPE: readonly ScopeNeed[] = [];

export const scopesOf = (tool: Pick<ToolDefinition, 'kind' | 'scopes'>): readonly ScopeNeed[] =>
  tool.scopes ?? (tool.kind === 'read' ? ['issues:read'] : ['issues:read', 'issues:write']);

export const offeredTo = (tool: Pick<ToolDefinition, 'kind' | 'scopes'>, held: readonly PatScope[]): boolean =>
  scopesOf(tool).every(need => (typeof need === 'string' ? held.includes(need) : need.some(s => held.includes(s))));

/** Every smallest scope set that satisfies a tool: one per alternative of each choice. */
export function leastScopes(tool: Pick<ToolDefinition, 'kind' | 'scopes'>): PatScope[][] {
  return scopesOf(tool).reduce<PatScope[][]>(
    (sets, need) =>
      (typeof need === 'string' ? [need] : need).flatMap(scope => sets.map(set => [...new Set([...set, scope])])),
    [[]],
  );
}
