export interface IssueReference {
  /** Upper-cased, `PH-675`. */
  key: string;
  project_key: string;
  number: number;
  /** Preceded by a closing keyword: `Fixes PH-675`. */
  closing: boolean;
}

export interface FindOptions {
  /** The web app's origin: `<origin>/issue/PH-675/…` counts as a reference. */
  issueUrlBase?: string | undefined;
  /** Leave out fenced and inline code, as a pull request body's examples are not references. */
  skipCode?: boolean | undefined;
}

export const MAX_REFERENCES_PER_TEXT = 50;

const CLOSING = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|implement(?:s|ed)?)';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A key may follow a slash (`feat/ph-675`) and be followed by a hyphen (`ph-675-login`), but never
// glued to a word, a version (`alpha-ph-675`) or a path that continues (`ph-675/notes`).
function keyPattern(keys: readonly string[]): string {
  return `(?<![A-Za-z0-9_-])(${keyList(keys)})-(\\d{1,7})(?![A-Za-z0-9_/])`;
}

function keyList(keys: readonly string[]): string {
  return [...new Set(keys.map(k => k.toUpperCase()))]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
}

function withoutCode(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

/** The issue keys a branch name, commit message or pull request mentions, in order, each once. */
export function findIssueReferences(
  text: string,
  projectKeys: readonly string[],
  options: FindOptions = {},
): { references: IssueReference[]; truncated: boolean } {
  if (projectKeys.length === 0 || !text) return { references: [], truncated: false };
  const source = options.skipCode ? withoutCode(text) : text;
  const key = keyPattern(projectKeys);
  const separator = '\\s*(?:,|\\band\\b|&)\\s*';
  const closingRun = new RegExp(`\\b${CLOSING}\\b:?\\s+((?:${key})(?:${separator}(?:${key}))*)`, 'gi');
  const single = new RegExp(key, 'gi');

  const closing = new Set<string>();
  for (const run of source.matchAll(closingRun)) {
    for (const m of run[1]!.matchAll(new RegExp(key, 'gi'))) closing.add(`${m[1]!.toUpperCase()}-${Number(m[2])}`);
  }

  const seen = new Map<string, IssueReference>();
  let truncated = false;
  const add = (projectKey: string, digits: string) => {
    const ref = `${projectKey.toUpperCase()}-${Number(digits)}`;
    if (seen.has(ref)) return;
    if (seen.size >= MAX_REFERENCES_PER_TEXT) {
      truncated = true;
      return;
    }
    seen.set(ref, {
      key: ref,
      project_key: projectKey.toUpperCase(),
      number: Number(digits),
      closing: closing.has(ref),
    });
  };

  const positions: { index: number; projectKey: string; digits: string }[] = [];
  for (const m of source.matchAll(single)) positions.push({ index: m.index!, projectKey: m[1]!, digits: m[2]! });
  if (options.issueUrlBase) {
    const base = escape(options.issueUrlBase.replace(/\/+$/, ''));
    const url = new RegExp(`${base}/issue/(${keyList(projectKeys)})-(\\d{1,7})(?![0-9])`, 'gi');
    for (const m of source.matchAll(url)) positions.push({ index: m.index!, projectKey: m[1]!, digits: m[2]! });
  }
  positions.sort((a, b) => a.index - b.index);
  for (const p of positions) add(p.projectKey, p.digits);
  return { references: [...seen.values()], truncated };
}

/** A pull request that undoes another: by its title (`Revert "…"`, `Revert: …`) or its branch. */
export function isRevert(title: string, headRef: string): boolean {
  return /^revert(?:\s*"|:)/i.test(title.trim()) || /^revert[-/]/i.test(headRef);
}
