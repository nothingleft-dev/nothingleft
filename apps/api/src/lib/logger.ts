import { pino, stdSerializers, type LogFn, type Logger, type LoggerOptions, type TransportTargetOptions } from 'pino';
import { fileURLToPath } from 'node:url';
import { redactError } from '@nothingleft/analytics';
import type { Env } from '@config/env';

const MAX_DEPTH = 6;

function redactDeep(value: unknown, messages: Map<string, string>, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      const redacted = redactError(value);
      if (!(redacted instanceof Error)) return redacted;
      if (redacted !== value) messages.set(value.message, redacted.message);
      if (!(value instanceof AggregateError) || depth >= MAX_DEPTH) return redacted;
      const errors = value.errors.map(e => redactDeep(e, messages, depth + 1, seen));
      return Object.assign(Object.create(Object.getPrototypeOf(redacted) as object) as Error, redacted, {
        message: redacted.message,
        stack: redacted.stack,
        errors,
      });
    }
    if (depth >= MAX_DEPTH) return value;
    if (Array.isArray(value)) return value.map(v => redactDeep(v, messages, depth + 1, seen));
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto !== Object.prototype && proto !== null) return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, messages, depth + 1, seen)]));
  } finally {
    seen.delete(value);
  }
}

export function maskHookId(url: string | undefined): string | undefined {
  return url?.replace(/(\/v1\/git\/webhooks\/[^/?]+\/)[^/?]+/, '$1[redacted]');
}

export function loggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    base: { service: 'api', env: env.NODE_ENV },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    serializers: {
      err: (err: unknown) => stdSerializers.err(redactError(err) as Error),
      // Fastify's own request fields, with a git hook URL's id masked: it routes deliveries to a connection.
      req: (req: {
        method?: string;
        url?: string;
        hostname?: string;
        ip?: string;
        socket?: { remotePort?: number };
      }) => ({
        method: req.method,
        url: maskHookId(req.url),
        host: req.hostname,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort,
      }),
    },
    hooks: {
      // Given no message, pino copies the error's own message into `msg`, past the serializer.
      logMethod(args, method) {
        const messages = new Map<string, string>();
        const walked = (args as unknown[]).map(a => (typeof a === 'string' ? a : redactDeep(a, messages)));
        const safe = walked.map(a => (typeof a === 'string' ? (messages.get(a) ?? a) : a));
        return method.apply(this, safe as Parameters<LogFn>);
      },
    },
  };
}

type TargetEnv = Pick<Env, 'LOG_LEVEL' | 'LOG_TARGETS' | 'LOG_FILE' | 'NODE_ENV' | 'POSTHOG_KEY' | 'POSTHOG_HOST'>;

export function logTargets(env: TargetEnv): TransportTargetOptions[] {
  return env.LOG_TARGETS.map(t => {
    switch (t) {
      case 'pretty':
        return {
          target: 'pino-pretty',
          level: env.LOG_LEVEL,
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        };
      case 'json':
        return { target: 'pino/file', level: env.LOG_LEVEL, options: { destination: 1 } };
      case 'file':
        return { target: 'pino/file', level: env.LOG_LEVEL, options: { destination: env.LOG_FILE, mkdir: true } };
      case 'posthog':
        return {
          target: fileURLToPath(import.meta.resolve('@nothingleft/analytics/log-transport')),
          level: 'warn',
          options: { host: env.POSTHOG_HOST, token: env.POSTHOG_KEY, service: 'api', environment: env.NODE_ENV },
        };
    }
  });
}

export function createLogger(env: Env): Logger {
  return pino({ ...loggerOptions(env), transport: { targets: logTargets(env) } });
}
