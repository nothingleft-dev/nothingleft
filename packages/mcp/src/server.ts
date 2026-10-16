import {
  CLIENT_CAPABILITIES_META_KEY,
  McpServer,
  ResourceTemplate,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  type ClientCapabilities,
  type RequestStateCodec,
  type InputRequiredResult,
  type ServerContext,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { t } from '@nothingleft/i18n';
import type { Me, Organization } from '@nothingleft/types';
import { apiClient, type ApiClient, type Fetch } from './api.ts';
import { ToolError, type ToolErrorBody } from './errors.ts';
import { errorMarkdown, join } from './render.ts';
import { parseArguments } from './validate.ts';
import { TOOLS } from './tools/index.ts';
import { RESOURCES } from './resources/index.ts';
import { PROMPTS } from './prompts/index.ts';
import type { PromptDefinition, ResourceDefinition } from './surface.ts';
import type { TimeZoneCache } from './time-zones.ts';
import type { ToolContext, ToolDefinition } from './tool.ts';

export type ToolName = (typeof TOOLS)[number]['name'];
export const TOOL_NAMES = TOOLS.map(t => t.name) as ToolName[];

export interface ToolCallEvent {
  tool: ToolName;
  ok: boolean;
  error_code: string | null;
  duration_ms: number;
  argument_count: number;
  api_calls: number;
}

export interface McpServerOptions {
  /** The caller's PAT, forwarded unchanged: the API re-checks scopes and roles on every call. */
  token: string;
  /** The PAT's owner: a confirmation is answered only by the person it was put to. */
  userId: number;
  /** At least 32 bytes, the same on every instance, so a question asked by one can be answered on another. */
  confirmationKey: Uint8Array;
  apiBaseUrl: string;
  appBaseUrl: string;
  fetch: Fetch;
  requestId?: string;
  version?: string;
  onToolCall?: (event: ToolCallEvent) => void;
  /** Shared across requests by a long-lived handler; without one, each call looks the timezone up. */
  timeZones?: TimeZoneCache;
}

/**
 * The SDK would validate arguments itself and answer with a raw Zod dump. Advertising the
 * real JSON Schema while accepting anything lets parseArguments answer instructively instead.
 */
function advertised(schema: z.ZodObject): StandardSchemaWithJSON {
  const standard = (schema as unknown as StandardSchemaWithJSON)['~standard'];
  return { '~standard': { ...standard, validate: value => ({ value }) } };
}

// The API names a field by its REST parameter; the agent knows it by the tool's argument.
const API_FIELD_TO_ARGUMENT: Record<string, string> = { key: 'project', username: 'user', slug: 'org', q: 'query' };

function inArgumentTerms(tool: ToolDefinition, body: ToolErrorBody): ToolErrorBody {
  const argument = body.field ? API_FIELD_TO_ARGUMENT[body.field] : undefined;
  return argument && argument in tool.input.shape ? { ...body, field: argument } : body;
}

const ANNOTATIONS = {
  read: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
} as const;

const CONFIRMATION = 'confirm';
const CONFIRMATION_SCHEMA = {
  type: 'object' as const,
  properties: { proceed: { type: 'boolean' as const, title: t('mcp.confirm_field') } },
  required: ['proceed'],
};

// Stateless serving has no initialize state: only a 2026-07-28 request's own envelope can declare the capability.
function canAskThePerson(request: ServerContext): boolean {
  const envelope = request.mcpReq.envelope as Record<string, unknown> | undefined;
  const elicitation = (envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined)?.elicitation;
  return elicitation !== undefined && (elicitation.form !== undefined || elicitation.url === undefined);
}

interface AskedFor {
  call: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function callDigest(tool: ToolDefinition, args: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(`${tool.name}\0${canonical(args)}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

// The answer counts only alongside the state minted with the question, for this person and these exact arguments.
async function askedForThisCall(
  codec: RequestStateCodec<AskedFor>,
  tool: ToolDefinition,
  args: Record<string, unknown>,
  request: ServerContext,
): Promise<boolean> {
  const state = request.mcpReq.requestState<unknown>();
  if (typeof state !== 'string') return false;
  try {
    const asked = await codec.verify(state, request);
    return asked.call === (await callDigest(tool, args));
  } catch {
    return false;
  }
}

/** null once the person has said yes to this very call; otherwise the question to put to them. */
async function confirmation(
  codec: RequestStateCodec<AskedFor>,
  tool: ToolDefinition,
  ctx: ToolContext,
  args: Parameters<ToolDefinition['run']>[1],
  request: ServerContext,
): Promise<InputRequiredResult | null> {
  if (!canAskThePerson(request)) {
    throw ToolError.local('mcp.confirm_unavailable', {
      tool: tool.name,
      action: await tool.describeAction!(ctx, args),
    });
  }
  const answer = inputResponse(request.mcpReq.inputResponses, CONFIRMATION);
  if (answer.kind === 'missing') {
    const action = await tool.describeAction!(ctx, args);
    return inputRequired({
      requestState: await codec.mint({ call: await callDigest(tool, args) }, request),
      inputRequests: {
        [CONFIRMATION]: inputRequired.elicit({
          message: t('mcp.confirm_prompt', { tool: tool.name, action }),
          requestedSchema: CONFIRMATION_SCHEMA,
        }),
      },
    });
  }
  const accepted = answer.kind === 'elicit' && answer.action === 'accept' && answer.content?.['proceed'] === true;
  if (accepted && (await askedForThisCall(codec, tool, args, request))) return null;
  throw ToolError.local('mcp.confirm_declined', { tool: tool.name });
}

/** One API client and its per-call caches; everything a tool, resource or prompt reaches data through. */
function contextFor(options: McpServerOptions): { ctx: ToolContext; api: ApiClient } {
  const api = apiClient({
    baseUrl: options.apiBaseUrl,
    token: options.token,
    fetch: options.fetch,
    ...(options.requestId ? { requestId: options.requestId } : {}),
  });
  let orgs: Promise<Organization[]> | undefined;
  let zone: Promise<string> | undefined;
  const memos = new Map<string, Promise<unknown>>();
  const ctx: ToolContext = {
    api,
    appBaseUrl: options.appBaseUrl,
    organizations: () => (orgs ??= api.get<Organization[]>('/v1/organizations').then(r => r.data)),
    timeZone: () =>
      (zone ??= (async () => {
        const known = options.timeZones?.get(options.userId);
        if (known) return known;
        const { data: me } = await api.get<Me>('/v1/me');
        options.timeZones?.set(options.userId, me.timezone);
        return me.timezone;
      })()),
    rememberTimeZone: next => {
      zone = Promise.resolve(next);
      options.timeZones?.set(options.userId, next);
    },
    memo: <T>(key: string, load: () => Promise<T>) => {
      if (!memos.has(key)) memos.set(key, load());
      return memos.get(key) as Promise<T>;
    },
  };
  return { ctx, api };
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'nothingleft', title: 'Nothing Left', version: options.version ?? '0.0.0' },
    { instructions: t('mcp.provenance.notice') },
  );
  const codec = createRequestStateCodec<AskedFor>({
    key: options.confirmationKey,
    bind: () => String(options.userId),
  });
  for (const tool of TOOLS) registerTool(server, tool as unknown as ToolDefinition, options, codec);
  for (const resource of RESOURCES) registerResource(server, resource, options);
  for (const prompt of PROMPTS) registerPrompt(server, prompt as unknown as PromptDefinition, options);
  return server;
}

function registerTool(
  server: McpServer,
  tool: ToolDefinition,
  options: McpServerOptions,
  codec: RequestStateCodec<AskedFor>,
) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: advertised(tool.input),
      annotations: { title: tool.title, ...ANNOTATIONS[tool.kind] },
    },
    async (raw: unknown, request: ServerContext) => {
      const started = performance.now();
      const { ctx, api } = contextFor(options);
      const argumentCount = raw && typeof raw === 'object' ? Object.keys(raw).length : 0;
      const report = (errorCode: string | null) =>
        options.onToolCall?.({
          tool: tool.name as ToolName,
          ok: errorCode === null,
          error_code: errorCode,
          duration_ms: Math.round(performance.now() - started),
          argument_count: argumentCount,
          api_calls: api.calls,
        });

      try {
        const args = parseArguments(tool.name, tool.input, raw);
        if (tool.kind === 'destructive') {
          const question = await confirmation(codec, tool, ctx, args, request);
          // The answer arrives as a retry of this call; that retry is the call reported.
          if (question) return question;
        }
        const result = await tool.run(ctx, args);
        report(null);
        return { content: [{ type: 'text' as const, text: result.markdown }] };
      } catch (error) {
        if (!(error instanceof ToolError)) throw error;
        const body = inArgumentTerms(tool, error.body);
        report(body.code);
        return {
          content: [{ type: 'text' as const, text: errorMarkdown(body) }],
          isError: true,
        };
      }
    },
  );
}

// A resource or prompt has no isError channel: its failure is a protocol error whose message is the markdown.
async function orMarkdownError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ToolError) throw new Error(errorMarkdown(error.body), { cause: error });
    throw error;
  }
}

function registerResource(server: McpServer, resource: ResourceDefinition, options: McpServerOptions) {
  const list = resource.list;
  const template = new ResourceTemplate(resource.template, {
    list: list
      ? async () =>
          orMarkdownError(async () => ({
            resources: (await list(contextFor(options).ctx)).map(r => ({ ...r, mimeType: 'text/markdown' })),
          }))
      : undefined,
  });
  server.registerResource(
    resource.name,
    template,
    { title: resource.title, description: resource.description, mimeType: 'text/markdown' },
    async (uri, variables) =>
      orMarkdownError(async () => {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(variables)) {
          // The SDK's `{?org}` refuses a URI without the query, so the last variable carries it instead.
          const [value, query] = (Array.isArray(v) ? v[0]! : v).split('?') as [string, string | undefined];
          flat[k] = decodeURIComponent(value);
          for (const [qk, qv] of new URLSearchParams(query ?? '')) flat[qk] = qv;
        }
        const text = await resource.read(contextFor(options).ctx, flat);
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
      }),
  );
}

function registerPrompt(server: McpServer, prompt: PromptDefinition, options: McpServerOptions) {
  server.registerPrompt(
    prompt.name,
    { title: prompt.title, description: prompt.description, argsSchema: advertised(prompt.input) },
    async (raw: unknown) =>
      orMarkdownError(async () => {
        const args = parseArguments(prompt.name, prompt.input, raw);
        const { text, resources = [] } = await prompt.build(contextFor(options).ctx, args);
        return {
          description: prompt.description,
          messages: [
            ...resources.map(r => ({
              role: 'user' as const,
              content: {
                type: 'resource' as const,
                resource: { uri: r.uri, mimeType: 'text/markdown', text: r.markdown },
              },
            })),
            { role: 'user' as const, content: { type: 'text' as const, text: join(text, t('mcp.provenance.notice')) } },
          ],
        };
      }),
  );
}

export const toolDefinitions = TOOLS;
export const resourceDefinitions = RESOURCES;
export const promptDefinitions = PROMPTS;
