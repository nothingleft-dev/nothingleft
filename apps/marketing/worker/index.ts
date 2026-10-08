import {
  MIN_FILL_MS,
  SUPPORT_ENDPOINT,
  invalidField,
  type SupportErrorBody,
  type SupportErrorCode,
  type SupportField,
  type SupportRequest,
} from '../src/lib/support-contract';
import { DOC_SLUGS } from '../src/data/docs';
import {
  REACTIONS_ENDPOINT,
  emptyCounts,
  isReaction,
  type ReactionChange,
  type ReactionCounts,
} from '../src/lib/reactions-contract';

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

interface TursoStatement {
  sql: string;
  args?: TursoArg[];
}

interface TursoResult {
  type: string;
  response?: { result?: { rows?: { type: string; value?: string }[][] } };
}

// Turso's HTTP pipeline API, called with fetch so the Worker carries no client library.
async function pipeline(env: Env, statements: TursoStatement[]): Promise<TursoResult[] | null> {
  const base = env.TURSO_DATABASE_URL!.replace(/^libsql:\/\//, 'https://');
  const response = await fetch(`${base}/v2/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: [...statements.map(stmt => ({ type: 'execute', stmt })), { type: 'close' }],
    }),
  });
  if (!response.ok) return null;
  const results = ((await response.json()) as { results?: TursoResult[] }).results ?? [];
  const executed = results.slice(0, statements.length);
  return executed.length === statements.length && executed.every(r => r.type === 'ok') ? executed : null;
}

async function store(env: Env, request: SupportRequest): Promise<boolean> {
  const results = await pipeline(env, [
    { sql: CREATE_TABLE },
    {
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
  ]);
  return results !== null;
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

const CREATE_REACTIONS = `CREATE TABLE IF NOT EXISTS doc_reactions (
  article TEXT NOT NULL,
  reaction TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article, reaction)
)`;
const SELECT_COUNTS = 'SELECT reaction, count FROM doc_reactions WHERE article = ?';
const INCREMENT = `INSERT INTO doc_reactions (article, reaction, count) VALUES (?, ?, 1)
  ON CONFLICT (article, reaction) DO UPDATE SET count = count + 1`;
const DECREMENT = 'UPDATE doc_reactions SET count = MAX(count - 1, 0) WHERE article = ? AND reaction = ?';
const COUNTS_TTL_SECONDS = 60;

function countsFrom(result: TursoResult | undefined): ReactionCounts {
  const counts = emptyCounts();
  for (const [reaction, count] of result?.response?.result?.rows ?? []) {
    if (isReaction(reaction?.value)) counts[reaction.value] = Number(count?.value ?? 0);
  }
  return counts;
}

const countsCacheKey = (url: URL, article: string) =>
  new Request(`${url.origin}${REACTIONS_ENDPOINT}?article=${encodeURIComponent(article)}`);

async function handleReactions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return fail(503, 'not_configured');
  const cache = (caches as unknown as { default: Cache }).default;

  if (request.method === 'GET') {
    const article = url.searchParams.get('article') ?? '';
    if (!DOC_SLUGS.includes(article)) return fail(404, 'not_found');
    const cached = await cache.match(countsCacheKey(url, article));
    if (cached) return cached;
    const results = await pipeline(env, [{ sql: CREATE_REACTIONS }, { sql: SELECT_COUNTS, args: [arg(article)] }]);
    if (!results) return fail(502, 'storage_failed');
    const response = json(200, { data: { article, counts: countsFrom(results[1]) }, meta: {} });
    // The edge keeps counts for a minute; browsers revalidate, so a visitor never sees their own vote missing.
    response.headers.set('cache-control', `public, max-age=0, s-maxage=${COUNTS_TTL_SECONDS}`);
    await cache.put(countsCacheKey(url, article), response.clone());
    return response;
  }

  if (request.method !== 'POST') return fail(405, 'method_not_allowed');
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.some(allowed => allowed.test(origin))) return fail(403, 'forbidden_origin');

  let change: ReactionChange | undefined;
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const from = raw.from ?? null;
    const to = raw.to ?? null;
    if (typeof raw.article === 'string' && (from === null || isReaction(from)) && (to === null || isReaction(to))) {
      change = { article: raw.article, from, to };
    }
  } catch {
    change = undefined;
  }
  if (!change || !DOC_SLUGS.includes(change.article) || change.from === change.to) return fail(400, 'invalid_body');

  const statements: TursoStatement[] = [{ sql: CREATE_REACTIONS }];
  if (change.from) statements.push({ sql: DECREMENT, args: [arg(change.article), arg(change.from)] });
  if (change.to) statements.push({ sql: INCREMENT, args: [arg(change.article), arg(change.to)] });
  statements.push({ sql: SELECT_COUNTS, args: [arg(change.article)] });
  const results = await pipeline(env, statements);
  if (!results) return fail(502, 'storage_failed');
  await cache.delete(countsCacheKey(url, change.article));
  return json(200, { data: { article: change.article, counts: countsFrom(results.at(-1)) }, meta: {} });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === SUPPORT_ENDPOINT) return handleSupport(request, env);
    if (pathname === REACTIONS_ENDPOINT) return handleReactions(request, env);
    return fail(404, 'not_found');
  },
};
