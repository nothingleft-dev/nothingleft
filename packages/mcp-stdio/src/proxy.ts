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
  params?: { _meta?: Record<string, unknown>; name?: unknown; uri?: unknown; requestId?: string | number };
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

function dataOf(event: string): string {
  return event
    .split(/\r?\n/)
    .filter(l => l.startsWith('data:'))
    .map(l => l.slice(5).trimStart())
    .join('\n');
}

/**
 * One JSON-RPC line in, the endpoint's answer out. The endpoint is stateless, so the only things
 * carried between lines are the protocol version the handshake settled on and the requests still
 * in flight, which a client's `notifications/cancelled` aborts.
 */
export function createProxy({ url, token, fetch, write, version }: ProxyOptions) {
  let protocolVersion: string | undefined;
  const inFlight = new Map<string | number, AbortController>();
  // Subscription streams never end on their own; everything else is left to finish.
  const subscriptions = new Set<AbortController>();

  async function handle(line: string): Promise<void> {
    if (!line.trim()) return;
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    if (message.method === 'notifications/cancelled' && message.params?.requestId !== undefined) {
      inFlight.get(message.params.requestId)?.abort();
    }
    const controller = new AbortController();
    if (message.method === 'subscriptions/listen') subscriptions.add(controller);
    const id = message.id ?? undefined;
    if (id !== undefined && id !== null) inFlight.set(id, controller);

    // A client that cancelled a request has forgotten its id; answering it would read as a protocol error.
    const live = () => !controller.signal.aborted;
    const fail = (text: string) => {
      if (id !== undefined && live()) {
        write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: TRANSPORT_ERROR, message: text } }));
      }
    };
    let answered = false;
    const emit = (payload: string) => {
      const out = JSON.parse(payload) as Message;
      if (out.id !== undefined && out.id === id && !live()) return;
      if (out.id === id) answered = true;
      if (out.result?.protocolVersion) protocolVersion = out.result.protocolVersion;
      write(JSON.stringify(out));
    };

    try {
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
            signal: controller.signal,
          }),
        );
      } catch (error) {
        fail(`Could not reach ${url}: ${(error as Error).message}`);
        return;
      }

      // Relayed event by event: a subscription stream stays open, and its acknowledgement cannot wait for the end.
      if ((response.headers.get('content-type') ?? '').includes('text/event-stream') && response.body) {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        // Node's fetch does not always carry an abort through the pipe to a pending read; cancelling
        // the reader always ends it, and closes the connection under it.
        const stop = () => void reader.cancel().catch(() => {});
        controller.signal.addEventListener('abort', stop, { once: true });
        try {
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            for (let end = /\r?\n\r?\n/.exec(buffer); end; end = /\r?\n\r?\n/.exec(buffer)) {
              const data = dataOf(buffer.slice(0, end.index));
              buffer = buffer.slice(end.index + end[0].length);
              if (data) emit(data);
            }
          }
          const rest = live() ? dataOf(buffer) : '';
          if (rest) emit(rest);
        } catch (error) {
          if (!answered) fail(`The stream from ${url} broke: ${(error as Error).message}`);
        } finally {
          // Leaving early must close the connection too, or an open subscription outlives its handler.
          controller.signal.removeEventListener('abort', stop);
          await reader.cancel().catch(() => {});
        }
        return;
      }

      let body: string;
      try {
        body = await response.text();
      } catch (error) {
        fail(`The answer from ${url} broke: ${(error as Error).message}`);
        return;
      }
      if (response.status === 202 || !body) return;
      try {
        const parsed = JSON.parse(body) as Partial<Message> & { error?: { message?: string } };
        if (parsed.jsonrpc) return emit(body);
        // The API's own error envelope — a bad token answers 401 before any JSON-RPC exists.
        fail(parsed.error?.message ?? `HTTP ${response.status}`);
      } catch {
        fail(`HTTP ${response.status} from ${url}`);
      }
    } finally {
      subscriptions.delete(controller);
      if (id !== undefined && id !== null && inFlight.get(id) === controller) inFlight.delete(id);
    }
  }

  return {
    handle,
    /** Ends the open subscription streams so the process can exit once the other requests have answered. */
    close: () => {
      for (const controller of subscriptions) controller.abort();
    },
  };
}
