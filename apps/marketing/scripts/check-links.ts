// Usage, after `astro build`: bun scripts/check-links.ts [--pending=/docs/a,/docs/b] — pending routes are reported, not failed.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const distDir = join(import.meta.dir, '..', 'dist');
const pending = new Set(
  process.argv
    .filter(arg => arg.startsWith('--pending='))
    .flatMap(arg => arg.slice('--pending='.length).split(','))
    .map(route => route.trim())
    .filter(Boolean),
);

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const attributeValues = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'g'))].map(match =>
    decodeEntities(match[1] ?? match[2] ?? ''),
  );

// Script and style bodies can hold strings that look like markup.
const markupOnly = (html: string) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

function routeOf(file: string): string {
  const path = '/' + relative(distDir, file).replace(/\\/g, '/');
  if (path === '/index.html') return '/';
  return path.replace(/\/index\.html$/, '').replace(/\.html$/, '');
}

function resolveTarget(pathname: string): string | undefined {
  if (pathname === '/') return join(distDir, 'index.html');
  const direct = join(distDir, pathname);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  return [`${direct}.html`, join(direct, 'index.html')].find(existsSync);
}

const idCache = new Map<string, Set<string>>();
function idsIn(file: string): Set<string> {
  let ids = idCache.get(file);
  if (!ids) {
    ids = new Set(attributeValues(markupOnly(readFileSync(file, 'utf8')), 'id'));
    idCache.set(file, ids);
  }
  return ids;
}

const isInternal = (href: string) => (href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#');

interface Problem {
  page: string;
  href: string;
  reason: string;
}

const broken: Problem[] = [];
const waiting: Problem[] = [];
const files = htmlFiles(distDir);
let checked = 0;

for (const file of files) {
  const page = routeOf(file);
  const hrefs = new Set(attributeValues(markupOnly(readFileSync(file, 'utf8')), 'href').filter(isInternal));
  for (const href of hrefs) {
    if (href.startsWith('/api/')) continue;
    checked++;
    const hashAt = href.indexOf('#');
    const pathPart = (hashAt >= 0 ? href.slice(0, hashAt) : href).split('?')[0]!;
    const fragment = hashAt >= 0 ? decodeURIComponent(href.slice(hashAt + 1)) : '';
    const pathname = pathPart ? decodeURIComponent(pathPart) : page;
    const target = resolveTarget(pathname);
    if (!target) {
      (pending.has(pathname) ? waiting : broken).push({ page, href, reason: 'no built page' });
      continue;
    }
    if (fragment && target.endsWith('.html') && !idsIn(target).has(fragment)) {
      broken.push({ page, href, reason: `no id "${fragment}" in ${routeOf(target)}` });
    }
  }
}

const report = (problems: Problem[]) => {
  const byHref = Map.groupBy(problems, problem => `${problem.href}  (${problem.reason})`);
  for (const [link, list] of [...byHref].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${link}`);
    for (const { page } of list) console.log(`      on ${page}`);
  }
};

console.log(`Checked ${checked} internal links across ${files.length} pages.`);
if (waiting.length) {
  console.log(`\nExpected pending (${waiting.length}):`);
  report(waiting);
}
if (broken.length) {
  console.log(`\nBroken (${broken.length}):`);
  report(broken);
  process.exit(1);
}
console.log('\nNo broken links.');
