import type {
  GitConnectionError,
  GitConnectionHealth,
  OrgActivity,
  OrgActivityKind,
  OrgRole,
  ProjectRole,
} from '@nothingleft/types';
import { CONNECTION_REASON, HEALTH } from '@lib/git/words';
import { formatDate } from '@lib/datetime';
import { plural } from '@lib/numbers';
import { ORG_ROLE_LABELS, PROJECT_ROLE_LABELS } from '@lib/roles';

/**
 * One sentence with a subject, not `member_removed · alex · 12m` - DESIGN-SYSTEM § 9b.
 * The kind is the authority; the values only fill in the object.
 */
export const ACTIVITY_LABELS: Record<OrgActivityKind, string> = {
  member_invited: 'invited someone',
  member_joined: 'joined the organisation',
  member_removed: 'removed a member',
  role_changed: 'changed a role',
  invite_created: 'created an invitation',
  invite_revoked: 'revoked an invitation',
  invite_rotated: 'rotated a share link',
  username_changed: 'changed a username',
  project_created: 'created a project',
  project_updated: 'changed a project',
  project_archived: 'archived a project',
  project_unarchived: 'unarchived a project',
  project_deleted: 'deleted a project',
  schema_changed: 'changed a project’s schema',
  custom_field_changed: 'changed a custom field',
  storage_connected: 'connected storage',
  storage_disconnected: 'disconnected storage',
  storage_updated: 'changed the storage key',
  ownership_transferred: 'transferred ownership',
  org_settings_changed: 'changed organisation settings',
  export_requested: 'requested an export',
  token_created: 'created an access token',
  token_revoked: 'revoked an access token',
  deletion_scheduled: 'scheduled the organisation for deletion',
  deletion_cancelled: 'cancelled the organisation’s deletion',
  tag_renamed: 'renamed a tag',
  tag_merged: 'merged tags',
  tag_deleted: 'deleted a tag',
  git_connection_created: 'connected a git account',
  git_connection_removed: 'disconnected a git account',
  git_connection_error: 'a git connection needs attention',
  repository_linked: 'linked a repository',
  repository_unlinked: 'unlinked a repository',
  automation_changed: 'changed an automation',
};

/** Events the system records with no person behind them; their label reads as a sentence on its own. */
export const isSystemActivity = (row: OrgActivity) => row.actor === null && row.kind === 'git_connection_error';

export const systemSentence = (row: OrgActivity) => {
  const label = ACTIVITY_LABELS[row.kind];
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const field = (value: unknown, key: string): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === 'string' && v !== '' ? v : null;
};

/** What a row acted on, by the names its values carry: a person, a field, a project to open. */
export function activitySubject(row: OrgActivity): { text: string | null; projectKey: string | null } {
  const pick = (key: string) => field(row.new_value, key) ?? field(row.old_value, key);
  const username = pick('username');
  const projectKey = pick('project_key') ?? pick('key');
  const name = pick('name') ?? pick('email');
  const self = username !== null && username === row.actor?.username;
  const text = username ? (self ? null : `@${username}`) : name;
  return { text, projectKey };
}

// member_joined also records joining a project; the organisation sentence would misstate it.
export function projectJoin(row: OrgActivity): 'self' | 'other' | null {
  if (row.kind !== 'member_joined' || row.target_type !== 'project_member') return null;
  const username = field(row.new_value, 'username');
  return username !== null && username !== row.actor?.username ? 'other' : 'self';
}

const AUTOMATION_VERBS: Record<string, string> = {
  created: 'created an automation',
  deleted: 'deleted an automation',
};

export function activityLabel(row: OrgActivity): string {
  if (row.kind === 'automation_changed') {
    return AUTOMATION_VERBS[field(row.new_value, 'change') ?? ''] ?? ACTIVITY_LABELS.automation_changed;
  }
  const join = projectJoin(row);
  if (join === null) return ACTIVITY_LABELS[row.kind];
  return join === 'self' ? 'joined a project' : 'added someone to a project';
}

/** A detail line: prose, with keys, repository paths and connection names set as code. */
export type DetailPart = string | { code: string };

type Values = Record<string, unknown>;

const values = (value: unknown): Values | null => {
  if (typeof value === 'string') {
    try {
      return values(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Values) : null;
};

const text = (v: Values | null, key: string) => field(v, key);
const quoted = (name: string) => `“${name}”`;
const handle = (username: string | null) => (username ? `@${username}` : 'nobody');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const orgRole = (role: string | null) => (role ? (ORG_ROLE_LABELS[role as OrgRole] ?? role) : null);
const projectRole = (role: string | null) => (role ? (PROJECT_ROLE_LABELS[role as ProjectRole] ?? role) : null);
const inProject = (key: string | null): DetailPart[] => (key ? [' in ', { code: key }] : []);

const SCHEMA_NOUNS: Record<string, string> = {
  statuses: 'status',
  priorities: 'priority',
  types: 'type',
  work_types: 'work type',
};

const JOINED_VIA: Record<string, string> = {
  link: 'through a share link',
  email: 'from an email invitation',
  created_organization: 'by creating it',
};

const STORAGE: Record<string, string> = { r2: 'R2', s3: 'S3' };

const minutes = (n: number) => {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SETTINGS: Record<string, { label: string; show: (v: unknown) => string }> = {
  name: { label: 'Name', show: v => quoted(String(v)) },
  slug: { label: 'Organisation ID', show: String },
  workday_minutes: { label: 'Workday', show: v => minutes(Number(v)) },
  workweek_days: { label: 'Working week', show: v => plural(Number(v), 'day') },
  week_starts_on: { label: 'Week starts on', show: v => DAYS[Number(v)] ?? String(v) },
};

const PROJECT_FIELDS: Record<string, { label: string; show: (v: unknown) => string }> = {
  name: { label: 'Name', show: v => quoted(String(v)) },
  lead: { label: 'Lead', show: v => handle(typeof v === 'string' ? v : null) },
  estimation_field: { label: 'Estimate field', show: v => (v ? quoted(String(v)) : 'none') },
  spent_time_field: { label: 'Spent time field', show: v => (v ? quoted(String(v)) : 'none') },
};

const humanKey = (key: string) => capital(key.replace(/_/g, ' '));
const plainValue = (v: unknown) =>
  v === null || v === undefined ? 'none' : typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v);

/** `Lead: nobody → @noor; Name: …`, for a patch whose keys are field names. */
function changes(
  before: Values | null,
  after: Values | null,
  known: Record<string, { label: string; show: (v: unknown) => string }>,
): string | null {
  const keys = Object.keys(after ?? before ?? {}).filter(k => k !== 'description');
  const lines = keys.map(key => {
    const spec = known[key] ?? { label: humanKey(key), show: plainValue };
    const from = before && key in before ? spec.show(before[key]) : null;
    const to = after && key in after ? spec.show(after[key]) : null;
    return `${spec.label}: ${from !== null && to !== null ? `${from} → ${to}` : (to ?? from)}`;
  });
  if (after && 'description' in after) lines.push('Description edited');
  return lines.length > 0 ? lines.join('; ') : null;
}

function schemaChange(o: Values | null, n: Values | null, noun: string): DetailPart[] {
  const action = text(n, 'action') ?? text(o, 'action') ?? 'changed';
  const before = text(o, 'name');
  const after = text(n, 'name');
  const key = text(n, 'project_key') ?? text(o, 'project_key');
  if (before && after && before !== after) {
    return [`Renamed ${noun} ${quoted(before)} to ${quoted(after)}`, ...inProject(key)];
  }
  const name = after ?? before;
  return [`${capital(action)} ${noun}${name ? ` ${quoted(name)}` : ''}`, ...inProject(key)];
}

/** What the change was, in words; null when the headline already says it all. */
export function activityDetail(row: OrgActivity): DetailPart[] | null {
  const o = values(row.old_value);
  const n = values(row.new_value);
  const self = (username: string | null) => username !== null && username === row.actor?.username;

  switch (row.kind) {
    case 'member_invited': {
      const role = projectRole(text(n, 'project_role')) ?? orgRole(text(n, 'org_role'));
      return [text(n, 'email') ?? 'Someone', role ? ` as ${role}` : '', ...inProject(text(n, 'project_key'))];
    }
    case 'member_joined': {
      const username = text(n, 'username');
      if (row.target_type === 'project_member') {
        const role = projectRole(text(n, 'project_role'));
        return [
          ...(self(username) ? [] : [`${handle(username)} to `]),
          ...(text(n, 'project_key') ? [{ code: text(n, 'project_key')! }] : ['the project']),
          role ? ` as ${role}` : '',
        ];
      }
      const via = JOINED_VIA[text(n, 'via') ?? ''];
      const role = orgRole(text(n, 'org_role'));
      const parts = [role, via].filter(Boolean).join(', ');
      const line = self(username) ? parts : [handle(username), parts].filter(Boolean).join(', ');
      return line ? [line] : null;
    }
    case 'member_removed': {
      const username = text(o, 'username');
      if (row.target_type === 'project_member') {
        const role = projectRole(text(o, 'project_role'));
        return [`${handle(username)} from `, { code: text(o, 'project_key') ?? '?' }, role ? `, was ${role}` : ''];
      }
      const role = orgRole(text(o, 'org_role'));
      return [`${handle(username)}${role ? `, was ${role}` : ''}`];
    }
    case 'role_changed': {
      const username = text(n, 'username') ?? text(o, 'username');
      if (row.target_type === 'project_member') {
        return [
          `${handle(username)}`,
          ...inProject(text(n, 'project_key')),
          ` from ${projectRole(text(o, 'project_role'))} to ${projectRole(text(n, 'project_role'))}`,
        ];
      }
      return [`${handle(username)} from ${orgRole(text(o, 'org_role'))} to ${orgRole(text(n, 'org_role'))}`];
    }
    case 'username_changed':
      return [`${handle(text(o, 'username'))} to ${handle(text(n, 'username'))}`];
    case 'invite_created': {
      const role = projectRole(text(n, 'project_role')) ?? orgRole(text(n, 'org_role'));
      const uses = typeof n?.['max_uses'] === 'number' ? plural(n['max_uses'] as number, 'use') : null;
      const domain = text(n, 'allowed_email_domain');
      const expires = text(n, 'expires_at');
      const limits = [
        uses,
        domain ? `only @${domain} emails` : null,
        expires ? `expires ${formatDate(expires)}` : null,
      ].filter(Boolean);
      return [
        `Share link${role ? ` for ${role}` : ''}`,
        ...inProject(text(n, 'project_key')),
        limits.length > 0 ? `, ${limits.join(', ')}` : '',
      ];
    }
    case 'invite_revoked': {
      const what = text(o, 'kind') === 'link' ? 'Share link' : (text(o, 'email') ?? 'Invitation');
      return [text(n, 'reason') === 'declined' ? `${what}, declined` : what];
    }
    case 'project_created':
    case 'project_archived':
    case 'project_unarchived':
    case 'project_deleted': {
      const key = text(n, 'key') ?? text(o, 'key');
      const name = text(n, 'name') ?? text(o, 'name');
      return key ? [{ code: key }, name ? ` ${name}` : ''] : name ? [name] : null;
    }
    case 'project_updated': {
      const line = changes(o, n, PROJECT_FIELDS);
      return line ? [line] : null;
    }
    case 'org_settings_changed': {
      const line = changes(o, n, SETTINGS);
      return line ? [line] : null;
    }
    case 'schema_changed': {
      const table = text(n, 'table') ?? text(o, 'table') ?? '';
      return schemaChange(o, n, SCHEMA_NOUNS[table] ?? 'value');
    }
    case 'custom_field_changed':
      return schemaChange(o, n, 'field');
    case 'automation_changed': {
      const name = text(n, 'automation');
      return [name ? quoted(name) : 'An automation', ...inProject(text(n, 'project'))];
    }
    case 'repository_linked':
    case 'repository_unlinked': {
      const repo = text(n, 'repository');
      const key = text(n, 'project');
      return [
        ...(repo ? [{ code: repo }] : ['A repository']),
        ...(key ? [row.kind === 'repository_linked' ? ' to ' : ' from ', { code: key }] : []),
      ];
    }
    case 'git_connection_created':
    case 'git_connection_removed': {
      const connection = text(n, 'connection');
      return connection ? [{ code: connection }] : null;
    }
    case 'git_connection_error': {
      const connection = text(n, 'connection') ?? text(n, 'login');
      const reason = CONNECTION_REASON[text(n, 'reason') as GitConnectionError];
      const health = HEALTH[text(n, 'health') as GitConnectionHealth]?.label;
      const why = reason ? capital(reason) : health;
      return [...(connection ? [{ code: connection }, why ? ': ' : ''] : []), why ?? ''];
    }
    case 'storage_connected':
    case 'storage_updated':
    case 'storage_disconnected': {
      const v = n ?? o;
      const bucket = text(v, 'bucket');
      const provider = STORAGE[text(v, 'provider') ?? ''] ?? 'Storage';
      const rekeyed =
        row.kind === 'storage_updated' && text(o, 'access_key_id') !== text(n, 'access_key_id')
          ? ', new access key'
          : '';
      return bucket ? [`${provider} bucket `, { code: bucket }, rekeyed] : null;
    }
    case 'ownership_transferred':
      return [`${handle(text(o, 'owner'))} to ${handle(text(n, 'owner'))}`];
    case 'export_requested':
      return [text(n, 'export') === 'org_activity' ? 'The audit log, as CSV' : 'Everything in the organisation'];
    case 'deletion_scheduled': {
      const at = text(n, 'deletes_at');
      return at ? [`Deletes on ${formatDate(at)}`] : null;
    }
    case 'tag_renamed':
      return [`${quoted(text(o, 'name') ?? '?')} to ${quoted(text(n, 'name') ?? '?')}`];
    case 'tag_merged': {
      const names = Array.isArray(o?.['names']) ? (o['names'] as unknown[]).map(String) : [];
      return [`${names.map(quoted).join(', ')} into ${quoted(text(n, 'name') ?? '?')}`];
    }
    case 'tag_deleted': {
      const name = text(o, 'name');
      return name ? [quoted(name)] : null;
    }
    default:
      return null;
  }
}
