import {
  MIN_FILL_MS,
  SUPPORT_ENDPOINT,
  invalidField,
  type SupportErrorBody,
  type SupportErrorCode,
  type SupportField,
  type SupportRequest,
} from '../src/lib/support-contract';

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

const ALLOWED_ORIGINS = [/^https:\/\/nothingleft\.dev$/, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
const MAX_BODY_BYTES = 16_384;

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS support_requests (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  area TEXT,
  status TEXT NOT NULL DEFAULT 'new'
)`;
const INSERT = `INSERT INTO support_requests (created_at, type, name, email, subject, message, area)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function fail(status: number, code: SupportErrorCode, field?: SupportField): Response {
  const body: SupportErrorBody = { error: field ? { code, field } : { code } };
  return json(status, body);
}

const accepted = () => json(201, { data: { received: true }, meta: {} });

function readRequest(raw: unknown): SupportRequest | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const text = (key: string) => (typeof r[key] === 'string' ? (r[key] as string).trim() : '');
  return {
    type: text('type') as SupportRequest['type'],
    name: text('name'),
    email: text('email'),
    subject: text('subject'),
    message: text('message'),
    area: text('area') as SupportRequest['area'],
    website: text('website'),
    elapsed_ms: typeof r.elapsed_ms === 'number' ? r.elapsed_ms : 0,
  };
}

type TursoArg = { type: 'text'; value: string } | { type: 'null' };
const arg = (value: string): TursoArg => (value ? { type: 'text', value } : { type: 'null' });

// Turso's HTTP pipeline API, called with fetch so the Worker carries no client library.
async function store(env: Env, request: SupportRequest): Promise<boolean> {
  const base = env.TURSO_DATABASE_URL!.replace(/^libsql:\/\//, 'https://');
  const response = await fetch(`${base}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: CREATE_TABLE } },
        {
          type: 'execute',
          stmt: {
            sql: INSERT,
            args: [
              arg(new Date().toISOString()),
              arg(request.type),
              { type: 'text', value: request.name },
              arg(request.email),
              arg(request.subject),
              arg(request.message),
              arg(request.area),
            ],
          },
        },
        { type: 'close' },
      ],
    }),
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { results?: { type: string }[] };
  return Boolean(result.results?.slice(0, 2).every(r => r.type === 'ok'));
}

async function handleSupport(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'method_not_allowed');
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.some(allowed => allowed.test(origin))) return fail(403, 'forbidden_origin');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'invalid_body');

  let input: SupportRequest | undefined;
  try {
    input = readRequest(await request.json());
  } catch {
    input = undefined;
  }
  if (!input) return fail(400, 'invalid_body');

  // Automated submissions get the same answer as people, so the check teaches a bot nothing.
  if (input.website || input.elapsed_ms < MIN_FILL_MS) return accepted();

  const field = invalidField(input);
  if (field) return fail(400, 'invalid_field', field);

  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return fail(503, 'not_configured');
  try {
    return (await store(env, input)) ? accepted() : fail(502, 'storage_failed');
  } catch {
    return fail(502, 'storage_failed');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === SUPPORT_ENDPOINT) return handleSupport(request, env);
    return fail(404, 'not_found');
  },
};
