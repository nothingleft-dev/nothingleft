import { expect, test } from 'bun:test';
import { docsSyncFailure } from '../ci/docs-sync.ts';

test('a change without routes passes', () => {
  expect(docsSyncFailure(['apps/api/src/services/x.service.ts', 'apps/web/app/page.tsx'])).toBeNull();
});

test('a route change with openapi.yaml passes', () => {
  expect(docsSyncFailure(['apps/api/src/routes/projects.ts', 'docs/openapi.yaml'])).toBeNull();
});

test('a route change without openapi.yaml fails and names the routes', () => {
  const failure = docsSyncFailure(['apps/api/src/routes/projects.ts', 'apps/api/src/routes/me.ts', 'docs/README.md']);
  expect(failure).toContain('docs/openapi.yaml');
  expect(failure).toContain('apps/api/src/routes/projects.ts');
  expect(failure).toContain('apps/api/src/routes/me.ts');
});

test('route tests do not count as routes', () => {
  expect(docsSyncFailure(['apps/api/test/projects.routes.test.ts'])).toBeNull();
});
