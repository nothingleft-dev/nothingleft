// Reads the built pages in dist/ and fails when they state a sample fact differently from
// each other or from src/data/sample.ts. Run after `astro build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  burndown,
  daysLeft,
  formatDate,
  formatDuration,
  formatMoment,
  ISSUES,
  issue,
  minutesFor,
  PEOPLE,
  person,
  resolvedAt,
  sprint,
  sprintSummary,
  TIME_ENTRIES,
  TIME_WEEK,
  datesBetween,
  type Handle,
} from '../src/data/sample';

const distDir = process.argv[2] ?? join(import.meta.dir, '..', 'dist');

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: (Node | string)[];
  parent: Node | null;
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return ENTITIES[name] ?? match;
  });

function parse(html: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [], parent: null };
  let current = root;
  const pattern =
    /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
  for (const match of html.matchAll(pattern)) {
    const [, , closing, opening, attrText, text] = match;
    if (text !== undefined) {
      current.children.push(decode(text));
    } else if (closing) {
      let node: Node | null = current;
      while (node && node.tag !== closing.toLowerCase()) node = node.parent;
      if (node?.parent) current = node.parent;
    } else if (opening) {
      const attrs: Record<string, string> = {};
      for (const attr of (attrText ?? '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attrs[attr[1] ?? ''] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
      }
      const node: Node = { tag: opening.toLowerCase(), attrs, children: [], parent: current };
      current.children.push(node);
      if (!VOID.has(node.tag) && !match[0].endsWith('/>')) current = node;
    }
  }
  return root;
}

const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join(node.tag === 'br' ? ' ' : '');
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const hasClass = (node: Node, name: string) => (node.attrs.class ?? '').split(/\s+/).includes(name);

function* walk(node: Node): Generator<Node> {
  yield node;
  for (const child of node.children) if (typeof child !== 'string') yield* walk(child);
}

// Text nodes in reading order, each with the element that holds it.
function textNodes(root: Node): { text: string; node: Node }[] {
  const out: { text: string; node: Node }[] = [];
  const visit = (node: Node) => {
    for (const child of node.children) {
      if (typeof child === 'string') {
        const text = clean(child);
        if (text) out.push({ text, node });
      } else visit(child);
    }
  };
  visit(root);
  return out;
}

const insideDemoState = (node: Node) => {
  for (let at: Node | null = node; at; at = at.parent) if ('data-sk-demo' in at.attrs) return true;
  return false;
};

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

const problems: string[] = [];
const fail = (page: string, message: string) => problems.push(`${page}: ${message}`);

const TITLE_OF = new Map(ISSUES.map(candidate => [candidate.key, candidate.title]));
const KEY_OF_TITLE = new Map(ISSUES.map(candidate => [candidate.title, candidate.key]));
const NAMES = new Map(PEOPLE.map(candidate => [candidate.name, candidate.handle]));
const ROW_CLASSES = ['card', 'row', 'issue', 'hit', 'kb-hit', 'bl-row', 'et-bl-row', 'sk-card'];
const POINT_CLASSES = ['pts', 'sk-pts', 'et-pts', 'pt-pts', 'pt-chip-pts'];
const PRIORITIES = new Set(['Show-stopper', 'Critical', 'Major', 'Normal', 'Minor']);
const TYPES = new Set(['Bug', 'Feature', 'Task', 'Epic']);
const STATUSES = new Set(['Submitted', 'Open', 'In Progress', 'Reopened', 'Fixed', 'Closed']);
const NOISE = /^(?:[\s\d·,.:;–—()/+−-]*|points?|pts?|subtask of|parent for|depends on)$/i;
const titlesSeen = new Map<string, Map<string, Set<string>>>();

function noteTitle(key: string, title: string, page: string) {
  const byTitle = titlesSeen.get(key) ?? new Map<string, Set<string>>();
  byTitle.set(title, (byTitle.get(title) ?? new Set()).add(page));
  titlesSeen.set(key, byTitle);
}

const looksLikeTitle = (text: string) =>
  /^[A-Z][a-z]/.test(text) &&
  text.split(' ').length >= 3 &&
  !/[.!?]$/.test(text) &&
  !/ (is|are|was|has|goes|go) /.test(text);

const s08 = burndown('Sprint 08');
const s07 = burndown('Sprint 07');
const s07Final = s07[s07.length - 1];
const summary = sprintSummary('Sprint 08');
const recorded = s08.filter(d => d.scope !== null);
const acme12Resolved = resolvedAt('ACME-12');
const acme12 = issue('ACME-12');
const acme12Points = acme12.points?.at(-1)?.value;
const acme12Spent = TIME_ENTRIES.filter(entry => entry.issue === 'ACME-12').reduce<number[]>(
  (sums, entry) => [...sums, (sums.at(-1) ?? 0) + entry.minutes],
  [],
);

const durationMinutes = (text: string) => {
  let total = 0;
  for (const [, count, unit] of text.matchAll(/(\d+)([wdhm])/g)) {
    total += Number(count) * { w: 2400, d: 480, h: 60, m: 1 }[unit as 'w' | 'd' | 'h' | 'm'];
  }
  return total;
};

for (const file of htmlFiles(distDir)) {
  const page = file.slice(distDir.length + 1);
  const root = parse(readFileSync(file, 'utf8'));
  const body = [...walk(root)].find(node => node.tag === 'body') ?? root;
  const nodes = textNodes(body);
  const fullText = nodes.map(n => n.text).join(' ');
  const starts: number[] = [];
  nodes.reduce((offset, n) => (starts.push(offset), offset + n.text.length + 1), 0);
  const nodeAt = (offset: number) => {
    let index = 0;
    while (index + 1 < starts.length && (starts[index + 1] ?? 0) <= offset) index += 1;
    return nodes[index]?.node;
  };

  // Titles: a key followed by its title, in the same element or the next title-like one.
  nodes.forEach(({ text, node }, index) => {
    for (const match of text.matchAll(/\b(ACME-\d+)\b(?:,\s*([^,]+?)(?:,|$))?/g)) {
      const key = match[1] ?? '';
      if (!TITLE_OF.has(key)) {
        fail(page, `${key} is not in src/data/sample.ts`);
        continue;
      }
      let candidate = match[2]?.trim();
      let holder = node;
      if (!candidate && text === key && node.tag !== 'button') {
        for (let next = index + 1; next < nodes.length && next <= index + 4; next += 1) {
          const following = nodes[next];
          if (!following || following.text === '/') break;
          if (NOISE.test(following.text)) continue;
          candidate = following.text;
          holder = following.node;
          break;
        }
      }
      if (!candidate || !/^[A-Z]/.test(candidate) || NAMES.has(candidate) || holder.tag === 'button') continue;
      const canonical = TITLE_OF.get(key) ?? '';
      if (candidate.startsWith(canonical)) continue;
      const titled =
        KEY_OF_TITLE.has(candidate) ||
        holder === node ||
        holder === node.parent ||
        holder.parent === node.parent ||
        ['em', 'b', 'strong'].includes(holder.tag) ||
        /(^|\s)(t|[\w-]*title)(\s|$)/.test(holder.attrs.class ?? '');
      if (titled && (KEY_OF_TITLE.has(candidate) || looksLikeTitle(candidate))) noteTitle(key, candidate, page);
    }
  });

  // Daily figures and CSV rows of the Sprint 08 burndown.
  for (const row of walk(body)) {
    const iso = row.attrs['data-for'];
    if (row.tag !== 'tr' || !iso || !/^2026-\d\d-\d\d$/.test(iso)) continue;
    const day = s08.find(d => d.date === iso);
    const cells = row.children
      .filter((c): c is Node => typeof c !== 'string' && c.tag === 'td')
      .map(c => clean(textOf(c)));
    if (!day || cells.length < 5) continue;
    const show = (value: number | null) => (value === null ? '—' : String(value));
    const added =
      day.scope === null
        ? '—'
        : String(day.scope - summary.committed).replace(/^(\d+)$/, n => (n === '0' ? '0' : `+${n}`));
    const expected = [show(day.remaining), String(day.ideal), show(day.scope), added, show(day.completed)];
    if (cells.join('|') !== expected.join('|'))
      fail(page, `Sprint 08 on ${iso} reads ${cells.join(' | ')}, expected ${expected.join(' | ')}`);
  }
  for (const [, iso, remaining, ideal, scope, added, completed] of fullText.matchAll(
    /(2026-\d\d-\d\d),(\d*),([\d.]+),(\d*),(-?\d*),(\d*),(?:true|false)/g,
  )) {
    const day = s08.find(d => d.date === iso);
    if (!day) continue;
    const got = [remaining, ideal, scope, added, completed].join(',');
    const want = [
      day.remaining ?? '',
      day.ideal,
      day.scope ?? '',
      day.scope === null ? '' : day.scope - summary.committed,
      day.completed ?? '',
    ].join(',');
    if (got !== want) fail(page, `burndown CSV row ${iso} is ${got}, expected ${want}`);
  }

  // Sprint figures stated in prose and headers.
  const ofPoints = [...fullText.matchAll(/\b(\d+) of (\d+) points?\b(?!\s+(?:left|from))/g)];
  for (const match of ofPoints) {
    const at = match.index ?? 0;
    const element = nodeAt(at);
    if (element && insideDemoState(element)) continue;
    const done = Number(match[1]);
    const total = Number(match[2]);
    const sprint08 = recorded.some(d => d.completed === done && d.scope === total);
    const sprint07 = s07Final && s07Final.completed === done && s07Final.scope === total;
    if (!sprint08 && !sprint07)
      fail(page, `"${fullText.slice(at, at + 40)}" matches no recorded day of Sprint 07 or 08`);
  }
  for (const [text, remaining, total] of fullText.matchAll(/\b(\d+) of (\d+) points left\b/g)) {
    if (!recorded.some(d => d.remaining === Number(remaining) && d.scope === Number(total))) {
      fail(page, `"${text}" matches no recorded day of Sprint 08`);
    }
  }
  const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  for (const [text, added] of fullText.matchAll(/\b(\w+) (?:points )?(?:were )?added after (?:the )?start\b/g)) {
    const value = Number(added) || WORDS[(added ?? '').toLowerCase()];
    if (value !== undefined && value !== summary.added)
      fail(page, `"${text}" but Sprint 08 had ${summary.added} added`);
  }
  for (const [text, date, before, after] of fullText.matchAll(
    /On (\d{1,2} \w{3} 2026), remaining work in Sprint 08 fell from (\d+) to (\d+)/g,
  )) {
    const index = s08.findIndex(d => formatDate(d.date) === date);
    if (s08[index - 1]?.remaining !== Number(before) || s08[index]?.remaining !== Number(after)) {
      fail(page, `"${text}" but Sprint 08 went from ${s08[index - 1]?.remaining} to ${s08[index]?.remaining}`);
    }
  }
  for (const [text, date] of fullText.matchAll(/\b[Ee]nds:? (\d{1,2} \w{3} 2026)/g)) {
    if (date !== formatDate(sprint('Sprint 08').end))
      fail(page, `"${text}" but Sprint 08 ends ${formatDate(sprint('Sprint 08').end)}`);
  }
  for (const [text, start] of fullText.matchAll(/\b(\d{1,2} \w{3})(?: 2026)? (?:–|to) 17 Oct 2026/g)) {
    if (`${start} 2026` !== formatDate(sprint('Sprint 08').start))
      fail(page, `"${text}" but Sprint 08 starts ${formatDate(sprint('Sprint 08').start)}`);
  }
  if (/Sprint 08/.test(fullText)) {
    for (const [text, days] of fullText.matchAll(/\b(\d+) days left\b/g)) {
      if (Number(days) !== daysLeft('Sprint 08'))
        fail(page, `"${text}" but Sprint 08 has ${daysLeft('Sprint 08')} days left`);
    }
  }

  // ACME-12's fixed facts.
  if (fullText.includes('ACME-12')) {
    for (const [text, at] of fullText.matchAll(/\bresolved (\d{1,2} \w{3} 2026, \d{1,2}:\d\d[ap]m)/g)) {
      if (acme12Resolved && at !== formatMoment(acme12Resolved))
        fail(page, `"${text}" but ACME-12 was resolved ${formatMoment(acme12Resolved)}`);
    }
    for (const [text, spent] of fullText.matchAll(/\b((?:\d+[hm] ?)+) of 2h\b/g)) {
      if (!acme12Spent.includes(durationMinutes(spent ?? ''))) {
        fail(
          page,
          `"${text}" is not a spent figure ACME-12 ever had (${acme12Spent.map(formatDuration).join(', then ')})`,
        );
      }
    }
    for (const [text, estimate] of fullText.matchAll(/\bEstimat(?:e|ion):? (\d+h)/g)) {
      if (durationMinutes(estimate ?? '') !== acme12.estimate)
        fail(page, `"${text}" but ACME-12's estimate is ${formatDuration(acme12.estimate ?? 0)}`);
    }
    for (const [text, due] of fullText.matchAll(/\b[Dd]ue(?: date)?:? (\d{1,2} \w{3})(?: 2026)?/g)) {
      if (`${due} 2026` !== formatDate(acme12.due ?? ''))
        fail(page, `"${text}" but ACME-12 is due ${formatDate(acme12.due ?? '')}`);
    }
    for (const [text, inline, field] of fullText.matchAll(/ACME-12 · (\d+) points?|Story points:? (\d+)/g)) {
      if (Number(inline ?? field) !== acme12Points)
        fail(page, `"${text}" but ACME-12 has ${acme12Points} story points`);
    }
  }

  // A "Reporter" field names the reporter sample.ts gives the issue shown.
  nodes.forEach(({ text }, index) => {
    if (text !== 'Reporter') return;
    const name = nodes
      .slice(index + 1, index + 4)
      .map(n => n.text)
      .find(t => NAMES.has(t));
    const key = nodes
      .slice(0, index)
      .reverse()
      .find(n => /^ACME-\d+$/.test(n.text))?.text;
    if (name && key && TITLE_OF.has(key) && NAMES.get(name) !== issue(key).reporter) {
      fail(page, `${key} shows reporter ${name}, but sample.ts has ${person(issue(key).reporter).name}`);
    }
  });

  // Logged time quoted in activity lines matches a time entry.
  for (const [text, name, duration, workType] of fullText.matchAll(
    /\b(Alex Lee|Casey Kim|Sam Ortiz|Jordan) logged ((?:\d+[hm] ?)+), (\w+)/g,
  )) {
    const handle = NAMES.get(name ?? '') as Handle;
    const minutes = durationMinutes(duration ?? '');
    if (
      !TIME_ENTRIES.some(entry => entry.author === handle && entry.minutes === minutes && entry.workType === workType)
    ) {
      fail(page, `"${text}" matches no time entry`);
    }
  }

  // Timesheets: a person's row, one cell per day of the week, then the total.
  const week = datesBetween(TIME_WEEK.start, TIME_WEEK.end);
  for (const row of walk(body)) {
    if (row.tag !== 'tr') continue;
    const cells = row.children.filter((c): c is Node => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th'));
    if (cells.length !== week.length + 2) continue;
    const label = clean(textOf(cells[0] as Node));
    const handle = [...NAMES].find(([name]) => label.includes(name))?.[1];
    const isTotal = /^Total/.test(label);
    if (!handle && !isTotal) continue;
    const values = cells.slice(1).map(cell => durationMinutes(clean(textOf(cell))));
    const expected = [
      ...week.map(date => minutesFor(handle ? { author: handle, date } : { date })),
      minutesFor(handle ? { author: handle } : {}),
    ];
    if (values.join(',') !== expected.join(',')) {
      fail(
        page,
        `timesheet row ${label} reads ${values.map(formatDuration).join(' | ')}, expected ${expected.map(formatDuration).join(' | ')}`,
      );
    }
  }

  // An issue row or card shows facts the issue has: its priority, type and points, and a status and assignees
  // it held at some moment. ACME-10 must always show its one assignee.
  for (const element of walk(body)) {
    if (!ROW_CLASSES.some(name => hasClass(element, name))) continue;
    const keys = [...walk(element)].filter(n => hasClass(n, 'key')).map(n => clean(textOf(n)));
    const key = keys[0];
    if (keys.length !== 1 || !key || !TITLE_OF.has(key)) continue;
    const known = issue(key);
    const inner = [...walk(element)];
    const people = new Set<string>();
    const labels = new Set<string>();
    for (const node of inner) {
      const title = node.attrs.title;
      if (title && NAMES.has(title)) people.add(title);
      if (title) labels.add(title);
      if (hasClass(node, 'who') || hasClass(node, 'sr-only')) {
        for (const name of NAMES.keys()) if (clean(textOf(node)).includes(name)) people.add(name);
        labels.add(clean(textOf(node)));
      }
    }
    const everAssigned = new Set(known.assignees.flatMap(change => change.value).map(handle => person(handle).name));
    for (const name of people)
      if (!everAssigned.has(name)) fail(page, `${key} is shown assigned to ${name}, who never had it`);
    if (key === 'ACME-10') {
      const current = new Set(known.assignees.at(-1)?.value.map(handle => person(handle).name));
      for (const name of people) if (!current.has(name)) fail(page, `ACME-10 is shown assigned to ${name}`);
    }
    for (const label of labels) {
      if (PRIORITIES.has(label) && label !== known.priority)
        fail(page, `${key} is shown as ${label}; it is ${known.priority}`);
      if (TYPES.has(label) && label !== known.type) fail(page, `${key} is shown as a ${label}; it is a ${known.type}`);
    }
    const statuses = new Set(known.status.map(change => change.value));
    for (const node of inner) {
      if (!hasClass(node, 'status') && !hasClass(node, 'hit-meta') && !hasClass(node, 'kb-hit-meta')) continue;
      const shown = clean(textOf(node));
      if (shown && STATUSES.has(shown) && !statuses.has(shown as never))
        fail(page, `${key} is shown ${shown}, a status it never had`);
    }
    for (const node of inner) {
      if (!POINT_CLASSES.some(name => hasClass(node, name))) continue;
      const shown = clean(textOf(node)).replace(/\s*(points?|pts?)$/, '');
      const points = known.points?.at(-1)?.value;
      if (/^\d+$/.test(shown) && Number(shown) !== points)
        fail(page, `${key} is shown with ${shown} points; it has ${points ?? 'none'}`);
    }
  }
}

for (const [key, byTitle] of titlesSeen) {
  const canonical = TITLE_OF.get(key);
  for (const [title, pages] of byTitle) {
    if (title !== canonical) fail([...pages].join(', '), `${key} is titled "${title}"; sample.ts has "${canonical}"`);
  }
}

if (problems.length > 0) {
  console.error(`Sample data clashes (${problems.length}):`);
  for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Sample data consistent across ${htmlFiles(distDir).length} pages.`);
