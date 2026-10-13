import { Writable } from 'node:stream';

export interface LogSinkOptions {
  host: string;
  token: string;
  service: string;
  environment: string;
  flushMs?: number;
  batchSize?: number;
  fetch?: typeof fetch;
}

type Line = Record<string, unknown>;
type AnyValue = { stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean };
interface Attribute {
  key: string;
  value: AnyValue;
}

const MAX_QUEUED = 1000;
const MAX_VALUE_CHARS = 8192;

// Request objects carry the client IP, host and full URL; an email subject can quote an issue title.
const DROPPED_KEYS = new Set(['req', 'res', 'subject', 'hostname', 'pid', 'level', 'time', 'msg', 'service', 'env']);
const ERROR_KEYS = ['type', 'message', 'stack', 'code'] as const;

const SEVERITY: Record<number, [number, string]> = {
  10: [1, 'TRACE'],
  20: [5, 'DEBUG'],
  30: [9, 'INFO'],
  40: [13, 'WARN'],
  50: [17, 'ERROR'],
  60: [21, 'FATAL'],
};

function anyValue(value: unknown): AnyValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { stringValue: text.slice(0, MAX_VALUE_CHARS) };
}

function attributesOf(line: Line): Attribute[] {
  const attributes: Attribute[] = [];
  const push = (key: string, raw: unknown) => {
    const value = anyValue(raw);
    if (value) attributes.push({ key, value });
  };
  for (const [key, raw] of Object.entries(line)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (key === 'err' && raw && typeof raw === 'object') {
      for (const field of ERROR_KEYS) push(`err.${field}`, (raw as Record<string, unknown>)[field]);
      continue;
    }
    push(key, raw);
  }
  return attributes;
}

export function toLogRecord(line: Line) {
  const [severityNumber, severityText] = SEVERITY[line.level as number] ?? [0, 'UNSPECIFIED'];
  const millis = typeof line.time === 'number' ? line.time : Date.now();
  return {
    timeUnixNano: `${BigInt(Math.trunc(millis)) * 1_000_000n}`,
    severityNumber,
    severityText,
    body: { stringValue: typeof line.msg === 'string' ? line.msg : '' },
    attributes: attributesOf(line),
  };
}

export function toOtlpPayload(lines: Line[], service: string, environment: string) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: service } },
            { key: 'deployment.environment', value: { stringValue: environment } },
          ],
        },
        scopeLogs: [{ scope: { name: 'pino' }, logRecords: lines.map(toLogRecord) }],
      },
    ],
  };
}

/** A pino transport stream that batches log lines to PostHog's OTLP logs endpoint. */
export function createLogSink(options: LogSinkOptions): Writable {
  const send = options.fetch ?? fetch;
  const endpoint = `${options.host.replace(/\/$/, '')}/i/v1/logs`;
  const batchSize = options.batchSize ?? 50;
  let queue: Line[] = [];
  let partial = '';
  let sending = Promise.resolve();

  const flush = () => {
    if (queue.length === 0) return sending;
    const batch = queue;
    queue = [];
    sending = sending.then(() =>
      send(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(toOtlpPayload(batch, options.service, options.environment)),
        signal: AbortSignal.timeout(10_000),
      }).then(
        () => undefined,
        // A log shipper cannot log its own failure without feeding itself; the host keeps every line.
        () => undefined,
      ),
    );
    return sending;
  };

  const take = (text: string) => {
    const lines = (partial + text).split('\n');
    partial = lines.pop() ?? '';
    for (const raw of lines) {
      if (!raw.trim()) continue;
      try {
        queue.push(JSON.parse(raw) as Line);
      } catch {
        continue;
      }
    }
    if (queue.length > MAX_QUEUED) queue = queue.slice(-MAX_QUEUED);
    if (queue.length >= batchSize) void flush();
  };

  const timer = setInterval(() => void flush(), options.flushMs ?? 5_000);
  timer.unref();

  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      take(chunk.toString());
      callback();
    },
    final(callback) {
      clearInterval(timer);
      take('\n');
      flush().then(() => callback());
    },
  });
}

export default (options: LogSinkOptions) => createLogSink(options);
