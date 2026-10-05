import type { OrgActivity, OrgActivityKind } from '@nothingleft/types';

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
  export_requested: 'exported the audit log',
  token_created: 'created an access token',
  token_revoked: 'revoked an access token',
  deletion_scheduled: 'scheduled the organisation for deletion',
  deletion_cancelled: 'cancelled the organisation’s deletion',
};

// Internal ids carry no meaning to a reader, so the values that do - usernames, keys,
// roles - are spelled out instead of the JSON they arrive as.
const NOISE = new Set(['id', 'org_id', 'user_id', 'project_id', 'invitation_id']);

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ') || null;

  const pairs = Object.entries(value as Record<string, unknown>)
    .filter(([key, v]) => !NOISE.has(key) && v !== null && v !== undefined)
    .map(([key, v]) => `${key.replace(/_/g, ' ')} ${asText(v)}`);
  return pairs.length > 0 ? pairs.join(' · ') : null;
};

export function activityDetail(row: OrgActivity): string | null {
  const from = asText(row.old_value);
  const to = asText(row.new_value);
  if (from !== null && to !== null) return `${from} → ${to}`;
  return to ?? from;
}
