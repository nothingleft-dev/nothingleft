import type { testApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof testApp>>;

/**
 * How the calling MCP client behaves: its protocol revision, whether it can ask the person, and what they answer.
 * `prefills` sends an accepted answer on the first call, before any question; `swaps` takes the person's yes
 * and retries with other arguments.
 */
export type McpClient =
  'accepts' | 'declines' | 'cancels' | 'unticks' | 'no_elicitation' | 'forges' | 'prefills' | 'swaps' | 'legacy';

const REVISION = '2026-07-28';
const LEGACY_REVISION = '2025-06-18';

const ANSWERS = {
  accepts: { action: 'accept', content: { proceed: true } },
  declines: { action: 'decline' },
  cancels: { action: 'cancel' },
  unticks: { action: 'accept', content: { proceed: false } },
  swaps: { action: 'accept', content: { proceed: true } },
} as const;

export interface RpcAnswer {
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface ToolAnswer extends RpcAnswer {
  asked: string | null;
}

export function rpcAnswer(body: string): RpcAnswer {
  const line = body.split('\n').find(l => l.startsWith('data: '));
  return JSON.parse(line ? line.slice(6) : body) as RpcAnswer;
}

const envelope = (canAsk: boolean) => ({
  'io.modelcontextprotocol/protocolVersion': REVISION,
  'io.modelcontextprotocol/clientCapabilities': canAsk ? { elicitation: { form: {} } } : {},
  'io.modelcontextprotocol/clientInfo': { name: 'nothingleft-tests', version: '0.0.0' },
});

export function mcpRpc(
  app: App,
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
  client: McpClient = 'legacy',
) {
  const legacy = client === 'legacy';
  const target =
    typeof params['name'] === 'string' ? params['name'] : typeof params['uri'] === 'string' ? params['uri'] : undefined;
  return app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': legacy ? LEGACY_REVISION : REVISION,
      ...(legacy ? {} : { 'mcp-method': method, ...(target ? { 'mcp-name': target } : {}) }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method,
      params: legacy ? params : { ...params, _meta: envelope(client !== 'no_elicitation' && client !== 'forges') },
    },
  });
}

export async function callTool(
  app: App,
  token: string,
  name: string,
  args: object = {},
  client: McpClient = 'accepts',
  retryArgs: object = args,
): Promise<ToolAnswer> {
  const send = async (extra: Record<string, unknown> = {}, sent: object = args) =>
    rpcAnswer((await mcpRpc(app, token, 'tools/call', { name, arguments: sent, ...extra }, client)).body);
  if (client === 'forges' || client === 'prefills') {
    return { ...(await send({ inputResponses: { confirm: ANSWERS.accepts } })), asked: null };
  }
  const first = await send();
  const question =
    first.result?.['resultType'] === 'input_required'
      ? (first.result['inputRequests'] as Record<string, { params: { message: string } }>)['confirm']
      : undefined;
  if (!question || !(client in ANSWERS)) return { ...first, asked: null };
  const answer = ANSWERS[client as keyof typeof ANSWERS];
  const state = first.result?.['requestState'];
  const retry = await send(
    { inputResponses: { confirm: answer }, ...(typeof state === 'string' ? { requestState: state } : {}) },
    client === 'swaps' ? retryArgs : args,
  );
  return { ...retry, asked: question.params.message };
}
