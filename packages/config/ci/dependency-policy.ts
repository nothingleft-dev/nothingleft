import { Glob } from 'bun';

const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
const CARET = /^\^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const EXCEPTIONS: Record<string, string> = { typescript: '~5' };

type Manifest = Partial<Record<(typeof SECTIONS)[number], Record<string, string>>>;

export function dependencyPolicyViolations(path: string, manifest: Manifest): string[] {
  const violations: string[] = [];
  for (const section of SECTIONS) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      if (range.startsWith('workspace:')) continue;
      const exception = EXCEPTIONS[name];
      if (exception !== undefined) {
        if (range !== exception) violations.push(`${path} ${section}.${name}: "${range}" must be "${exception}"`);
      } else if (!CARET.test(range)) {
        violations.push(`${path} ${section}.${name}: "${range}" is not a caret range from \`bun add ${name}@latest\``);
      }
    }
  }
  return violations;
}

async function manifests(root: string): Promise<string[]> {
  const found = ['package.json'];
  for (const pattern of ['apps/*/package.json', 'packages/*/package.json']) {
    for await (const path of new Glob(pattern).scan({ cwd: root })) found.push(path);
  }
  return found.sort();
}

if (import.meta.main) {
  const root = process.argv[2] ?? '.';
  const violations: string[] = [];
  for (const path of await manifests(root)) {
    violations.push(...dependencyPolicyViolations(path, await Bun.file(`${root}/${path}`).json()));
  }
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    console.error('Install with `bun add <pkg>@latest` (typescript: `bun add -d typescript@~5`). CLAUDE.md rule 1.');
    process.exit(1);
  }
  console.log('dependency-policy: ok');
}
