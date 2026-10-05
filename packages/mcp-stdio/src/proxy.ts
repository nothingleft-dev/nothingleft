export interface ProxyOptions {
  url: string;
  token: string;
  fetch: (request: Request) => Promise<Response>;
  write: (line: string) => void;
  version: string;
}

interface Message {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: { _meta?: Record<string, unknown>; name?: unknown; uri?: unknown };
  result?: { protocolVersion?: string };
}

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';
const NAME_FIELD: Record<string, 'name' | 'uri'> = {
  'tools/call': 'name',
  'prompts/get': 'name',
  'resources/read': 'uri',
};

// A header value is printable ASCII; the transport carries anything else in its base64 form.
function headerValue(value: string): string {
  if (/^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/.test(value)) return value;
  return `=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}

/** The 2026-07-28 revision repeats the version, method and target of a message in its headers. */
function revisionHeaders(message: Message): Record<string, string> {
  const version = message.params?._meta?.[PROTOCOL_VERSION_META];
  if (typeof version !== 'string' || !message.method) return {};
  const field = NAME_FIELD[message.method];
  const name = field ? message.params?.[field] : undefined;
  return {
    'mcp-protocol-version': version,
    'mcp-method': message.method,
    ...(typeof name === 'string' ? { 'mcp-name': headerValue(name) } : {}),
  };
}

// JSON-RPC implementation-defined server error range.
const TRANSPORT_ERROR = -32000;

/**
 * One JSON-RPC line in, the endpoint's answer out. The endpoint is stateless, so the only thing
 * carried between lines is the protocol version the handshake settled on.
 */
export function createProxy({ url, token, fetch, write, version }: ProxyOptions) {
  let protocolVersion: string | undefined;

  const fail = (id: Message['id'], message: string) => {
    if (id !== undefined) write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: TRANSPORT_ERROR, message } }));
  };

  const emit = (payload: string) => {
    const message = JSON.parse(payload) as Message;
    if (message.result?.protocolVersion) protocolVersion = message.result.protocolVersion;
    write(JSON.stringify(message));
  };

  return async function handle(line: string): Promise<void> {
    if (!line.trim()) return;
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    let response: Response;
    try {
      response = await fetch(
        new Request(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'user-agent': `nothingleft-mcp/${version}`,
            ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
            ...revisionHeaders(message),
          },
          body: line,
        }),
      );
    } catch (error) {
      fail(message.id, `Could not reach ${url}: ${(error as Error).message}`);
      return;
    }

    const body = await response.text();
    if (response.status === 202 || !body) return;

    if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      for (const event of body.split(/\r?\n\r?\n/)) {
        const data = event
          .split(/\r?\n/)
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trimStart())
          .join('\n');
        if (data) emit(data);
      }
      return;
    }

    try {
      const parsed = JSON.parse(body) as Partial<Message> & { error?: { message?: string } };
      if (parsed.jsonrpc) return emit(body);
      // The API's own error envelope — a bad token answers 401 before any JSON-RPC exists.
      fail(message.id, parsed.error?.message ?? `HTTP ${response.status}`);
    } catch {
      fail(message.id, `HTTP ${response.status} from ${url}`);
    }
  };
}
