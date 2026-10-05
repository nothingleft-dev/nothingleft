const ROUTES = 'apps/api/src/routes/';
const OPENAPI = 'docs/openapi.yaml';

export function docsSyncFailure(changedFiles: readonly string[]): string | null {
  const routes = changedFiles.filter(f => f.startsWith(ROUTES));
  if (routes.length === 0 || changedFiles.includes(OPENAPI)) return null;
  return [
    `${OPENAPI} was not changed, but these routes were:`,
    ...routes.map(f => `  ${f}`),
    'Update the OpenAPI document (and the affected manual page) in the same change. CLAUDE.md rule 4.',
  ].join('\n');
}

async function changedSince(base: string): Promise<string[]> {
  const proc = Bun.spawn(['git', 'diff', '--name-only', `${base}...HEAD`], { stdout: 'pipe', stderr: 'inherit' });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`git diff against ${base} failed`);
  return out.split('\n').filter(Boolean);
}

if (import.meta.main) {
  const base = process.argv[2];
  if (!base) {
    console.error('usage: bun packages/config/ci/docs-sync.ts <base-ref>');
    process.exit(2);
  }
  const failure = docsSyncFailure(await changedSince(base));
  if (failure) {
    console.error(failure);
    process.exit(1);
  }
  console.log('docs-sync: ok');
}
