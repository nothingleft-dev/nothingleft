const QUERY_ERRORS = new Set(['DrizzleQueryError', 'DatabaseError']);

// drizzle-orm's query error never sets `name`, so the constructor is checked too.
const isQueryError = (e: Error): boolean =>
  QUERY_ERRORS.has(e.name) || QUERY_ERRORS.has(e.constructor.name) || 'query' in e || 'params' in e;

function chainOf(err: Error): Error[] {
  const chain: Error[] = [];
  for (let e: unknown = err; e instanceof Error && !chain.includes(e); e = e.cause) chain.push(e);
  return chain;
}

function queryFailure(err: Error): Error {
  const chain = chainOf(err);
  const code = chain.map(e => (e as { code?: unknown }).code).find(c => typeof c === 'string');
  const innermost = chain.at(-1) ?? err;
  const failure = new Error(`Database query failed (${code ?? 'unknown'})`);
  failure.name = err.name;
  // The header line of a driver stack repeats its message, which can quote a value.
  const frames = (innermost.stack ?? err.stack ?? '').split('\n').filter(line => /^\s+at /.test(line));
  failure.stack = [`${failure.name}: ${failure.message}`, ...frames].join('\n');
  return failure;
}

/** Any database error in `err`'s cause chain becomes one that carries no SQL, parameters or row values. */
export function redactError(err: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (!(err instanceof Error)) return err;
  if (seen.has(err)) return undefined;
  seen.add(err);
  if (isQueryError(err)) return queryFailure(err);
  if (!(err.cause instanceof Error)) return err;
  const cause = redactError(err.cause, seen);
  // `undefined` back from an already-visited cause means a cycle, not a change.
  if (cause === err.cause || (cause === undefined && seen.has(err.cause))) return err;
  return Object.assign(Object.create(Object.getPrototypeOf(err) as object) as Error, err, {
    message: err.message,
    stack: err.stack,
    cause,
  });
}
