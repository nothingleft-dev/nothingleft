import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const web = `${repo}apps/web`;

async function ruleIds(cwd: string, filePath: string, code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd });
  const [result] = await eslint.lintText(code, { filePath: `${cwd}/${filePath}` });
  return (result?.messages ?? []).map(m => m.ruleId ?? 'fatal').filter(id => id.startsWith('nothingleft/'));
}

describe('root config', () => {
  const rawQuery = "import type { Db } from '@nothingleft/db';\nexport const q = (db: Db) => db.select();\n";
  const literal = "export const m = { message: 'Project not found.' };\n";

  test('raw db access is flagged everywhere but packages/db', async () => {
    expect(await ruleIds(repo, 'apps/api/src/services/x.service.ts', rawQuery)).toEqual(['nothingleft/no-raw-db']);
    expect(await ruleIds(repo, 'apps/api/test/x.test.ts', rawQuery)).toEqual(['nothingleft/no-raw-db']);
    expect(await ruleIds(repo, 'packages/db/src/repositories/x.repository.ts', rawQuery)).toEqual([]);
  });

  test('user-facing literals are flagged in apps/api/src only', async () => {
    expect(await ruleIds(repo, 'apps/api/src/routes/x.ts', literal)).toEqual(['nothingleft/no-user-facing-literals']);
    expect(await ruleIds(repo, 'apps/api/test/x.test.ts', literal)).toEqual([]);
    expect(await ruleIds(repo, 'apps/api/src/config/constants.ts', literal)).toEqual([]);
    expect(await ruleIds(repo, 'packages/format/src/x.ts', literal)).toEqual([]);
  });
});

describe('mcp packages', () => {
  const dbImport = "import { projectsRepository } from '@nothingleft/db';\nexport const r = projectsRepository;\n";

  test('reaching past the REST API is flagged in the MCP packages only', async () => {
    expect(await ruleIds(repo, 'packages/mcp/src/tools/x.ts', dbImport)).toEqual(['nothingleft/mcp-api-only']);
    expect(await ruleIds(repo, 'packages/mcp-stdio/src/index.ts', dbImport)).toEqual(['nothingleft/mcp-api-only']);
    expect(await ruleIds(repo, 'apps/api/src/services/x.service.ts', dbImport)).toEqual([]);
  });
});

describe('web config', () => {
  const request = "export const load = () => fetch('/v1/me');\n";
  const date = 'export const label = (d: Date) => d.toLocaleDateString();\n';
  const html = 'export const H = ({ h }: { h: string }) => <div dangerouslySetInnerHTML={{ __html: h }} />;\n';

  test('fetch is allowed only under lib/api', async () => {
    expect(await ruleIds(web, 'components/x.tsx', request)).toEqual(['nothingleft/no-http-client']);
    expect(await ruleIds(web, 'hooks/use-x.ts', request)).toEqual(['nothingleft/no-http-client']);
    expect(await ruleIds(web, 'lib/api/client.ts', request)).toEqual([]);
  });

  test('date formatting is allowed only under lib/datetime', async () => {
    expect(await ruleIds(web, 'components/x.tsx', date)).toEqual(['nothingleft/no-date-formatting']);
    expect(await ruleIds(web, 'lib/api/x.ts', date)).toEqual(['nothingleft/no-date-formatting']);
    expect(await ruleIds(web, 'lib/datetime/index.ts', date)).toEqual([]);
  });

  test('native controls are allowed only inside components/ui', async () => {
    const control = 'export const C = () => <input type="checkbox" />;\n';
    expect(await ruleIds(web, 'components/x.tsx', control)).toEqual(['nothingleft/no-native-controls']);
    expect(await ruleIds(web, 'components/ui/checkbox.tsx', control)).toEqual([]);
  });

  test('inner HTML is allowed only under components/markdown', async () => {
    expect(await ruleIds(web, 'components/x.tsx', html)).toEqual(['nothingleft/no-inner-html']);
    expect(await ruleIds(web, 'components/markdown/renderer.tsx', html)).toEqual([]);
  });
});
