import { t } from '@nothingleft/i18n';
import type { MemberRef } from '@nothingleft/types';
import type { Pagination } from './api.ts';
import type { ToolErrorBody } from './errors.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `19 Sep 2026`, from a calendar date or the UTC date of an instant. */
export function date(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

/** `25 Sep 2026, 8:48pm UTC`. The agent's timezone is unknown, so the zone is always named. */
export function instant(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  const h = at.getUTCHours();
  const minutes = String(at.getUTCMinutes()).padStart(2, '0');
  return `${date(iso)}, ${h % 12 || 12}:${minutes}${h < 12 ? 'am' : 'pm'} UTC`;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  org_admin: 'Org Admin',
  member: 'Member',
  project_admin: 'Project Admin',
  contributor: 'Contributor',
  observer: 'Observer',
};
export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

export const handle = (username: string) => `@${username}`;

/** `@casey (Casey Kim)`, or just `@casey` when the name adds nothing. */
export function person(
  ref: (Pick<MemberRef, 'username' | 'name' | 'former_member'> & Partial<Pick<MemberRef, 'deactivated'>>) | null,
): string {
  if (!ref) return '—';
  const name = ref.name && ref.name !== ref.username ? ` (${ref.name})` : '';
  const state = ref.former_member ? ' · former member' : ref.deactivated ? ' · deactivated' : '';
  return `${handle(ref.username)}${name}${state}`;
}

const cell = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ');

export function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n');
}

/** Two-column facts table; rows whose value is null are left out rather than shown empty. */
export function facts(rows: [string, string | null][]): string {
  const kept = rows.filter((r): r is [string, string] => r[1] !== null);
  return table(['', ''], kept);
}

export const code = (value: string) => `\`${value.replace(/`/g, "'")}\``;
export const list = (values: string[]) => values.map(code).join(', ');

export function more(p: Pagination | undefined, shown: number): string | null {
  if (!p || !p.has_more) return null;
  return t('mcp.hint.more', {
    from: p.offset + 1,
    to: p.offset + shown,
    total: p.total,
    next: p.offset + shown,
  });
}

export function moreByCursor(p: Pagination | undefined, shown: number): string | null {
  if (!p?.has_more || !p.next_cursor) return null;
  return t('mcp.hint.more_cursor', { shown, total: p.total, cursor: p.next_cursor });
}

export const join = (...blocks: (string | null | undefined | false)[]) =>
  blocks.filter((b): b is string => typeof b === 'string' && b.length > 0).join('\n\n');

export interface Provenance {
  author: string;
  place: string;
  date?: string;
}

/** Contributor text fenced so an agent reads it as data. Best effort: a delimiter is not a guarantee. */
export function untrusted(from: Provenance, body: string): string {
  const close = t('mcp.provenance.close', { author: from.author });
  const open = from.date
    ? t('mcp.provenance.open_dated', { author: from.author, date: from.date, place: from.place })
    : t('mcp.provenance.open', { author: from.author, place: from.place });
  // A copy of the real closing line inside the text is quoted, so only the server's own is bare.
  const fenced = body
    .split('\n')
    .map(line => (line.trim() === close ? `> ${line}` : line))
    .join('\n');
  return ['---', open, '', fenced, '', close, '---'].join('\n');
}

export const authorsOf = (refs: readonly { username: string }[]) =>
  [...new Set(refs.map(r => handle(r.username)))].join(', ');

export function errorMarkdown(error: ToolErrorBody): string {
  const lines = [`**Error ${code(error.code)}** — ${error.message}`];
  const extra: string[] = [];
  if (error.valid_values && error.valid_values.length > 0) {
    extra.push(`Valid values${error.field ? ` for ${code(error.field)}` : ''}: ${list(error.valid_values)}`);
    extra.push(t('mcp.hint.retry_with'));
  } else if (error.field) {
    extra.push(`Field: ${code(error.field)}`);
  }
  extra.push(...(error.hints ?? []));
  return join(lines.join('\n'), extra.join('\n'), error.request_id ? `request_id ${code(error.request_id)}` : null);
}
