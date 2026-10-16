import type { z } from 'zod';
import type { Organization } from '@nothingleft/types';
import type { ApiClient } from './api.ts';

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
  /** Destructive tools: what the call would do, put to the person before it runs. */
  describeAction?: (ctx: ToolContext, args: z.output<S>) => Promise<string>;
  run: (ctx: ToolContext, args: z.output<S>) => Promise<ToolResult>;
}

export const defineTool = <S extends z.ZodObject>(tool: ToolDefinition<S>): ToolDefinition<S> => tool;

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
] as const;
