import { z } from 'zod';
import {
  BYO_CHECK_REASONS,
  BYO_CHECK_STEPS,
  BYO_PROVIDERS,
  CUSTOM_FIELD_TYPES,
  DIGEST_CADENCES,
  NOTIFICATION_KINDS,
  REPORT_NAMES,
} from './constants.ts';

// Each schema is the property allow-list: the adapter drops undeclared keys, so no customer text leaks.

const id = z.number().int().positive();

export const EventCatalogue = {
  api_request: z.object({
    route: z.string(), // the route pattern (/v1/issues/:key), never the URL
    method: z.string(),
    status_code: z.number().int(),
    duration_ms: z.number().nonnegative(),
    via: z.enum(['session', 'pat', 'anonymous']),
    org_id: id.optional(),
  }),
  api_error: z.object({
    route: z.string(),
    method: z.string(),
    status_code: z.number().int(),
    error_code: z.string(),
    via: z.enum(['session', 'pat', 'anonymous']),
    org_id: id.optional(),
  }),
  account_created: z.object({ method: z.enum(['password', 'google', 'github']) }),
  signed_in: z.object({
    method: z.enum(['password', 'google', 'github']),
    second_factor: z.enum(['none', 'totp', 'recovery_code']),
  }),
  password_reset_completed: z.object({}),
  email_changed: z.object({}),
  avatar_uploaded: z.object({}),
  pat_created: z.object({
    scope_count: z.number().int().positive(),
    project_restricted: z.boolean(),
    expires: z.boolean(),
  }),
  pat_revoked: z.object({}),
  sessions_revoked: z.object({ count: z.number().int().positive(), all: z.boolean() }),
  organization_created: z.object({}),
  project_created: z.object({ key_generated: z.boolean() }),
  invitations_sent: z.object({ count: z.number().int().positive(), project_scoped: z.boolean() }),
  invite_link_created: z.object({ project_scoped: z.boolean(), limited: z.boolean() }),
  invitation_accepted: z.object({
    kind: z.enum(['email', 'link']),
    project_scoped: z.boolean(),
    already_member: z.boolean(),
    // Seconds from creation to acceptance, for the median time-to-accept in analytics.md.
    seconds_to_accept: z.number().nonnegative(),
  }),
  member_removed: z.object({
    reassigned: z.number().int().nonnegative(),
    unassigned: z.number().int().nonnegative(),
    views_transferred: z.number().int().nonnegative(),
    views_deleted: z.number().int().nonnegative(),
  }),
  // Once per user per UTC day: the activation funnel's second-day step and DAU/WAU/MAU.
  user_active_day: z.object({
    via: z.enum(['session', 'pat']),
    days_since_signup: z.number().int().nonnegative(),
  }),
  // `via` is the MCP-versus-UI ratio in analytics.md; no field carries issue text.
  issue_created: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    has_description: z.boolean(),
    assignee_count: z.number().int().nonnegative(),
  }),
  // Counts only: the query text is customer content and never leaves the server.
  issues_searched: z.object({
    via: z.enum(['session', 'pat']),
    clause_count: z.number().int().nonnegative(),
    grouped: z.boolean(),
    result_count: z.number().int().nonnegative(),
    // Custom field slugs the query names, counted; never which.
    custom_attribute_count: z.number().int().nonnegative(),
  }),
  issues_bulk_updated: z.object({
    via: z.enum(['session', 'pat']),
    requested: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  issues_exported: z.object({ via: z.enum(['session', 'pat']) }),
  comment_created: z.object({
    via: z.enum(['session', 'pat']),
    mention_count: z.number().int().nonnegative(),
  }),
  attachment_uploaded: z.object({
    via: z.enum(['session', 'pat']),
    size_bytes: z.number().int().nonnegative(),
    image: z.boolean(),
    draft: z.boolean(),
  }),
  time_logged: z.object({
    via: z.enum(['session', 'pat']),
    record_count: z.number().int().nonnegative(),
    row_count: z.number().int().nonnegative(),
    ranged: z.boolean(),
    on_behalf: z.boolean(),
  }),
  issues_linked: z.object({
    via: z.enum(['session', 'pat']),
    type: z.enum(['relates', 'depends', 'duplicate', 'subtask']),
    count: z.number().int().nonnegative(),
  }),
  tags_applied: z.object({
    via: z.enum(['session', 'pat']),
    entity: z.enum(['issue', 'article']),
    applied: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
  }),
  saved_view_created: z.object({ visibility: z.enum(['private', 'project', 'org']) }),
  sprint_created: z.object({
    via: z.enum(['session', 'pat']),
    scheduled: z.boolean(),
    carried_over: z.number().int().nonnegative(),
  }),
  sprint_started: z.object({
    via: z.enum(['session', 'pat']),
    issue_count: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
  }),
  sprint_finished: z.object({
    via: z.enum(['session', 'pat']),
    completed: z.number().int().nonnegative(),
    unfinished: z.number().int().nonnegative(),
    moved_to: z.enum(['backlog', 'sprint']),
  }),
  // Planning from the backlog or the issue's sprint field; `sprint_changed` false is a reorder only.
  backlog_moved: z.object({
    via: z.enum(['session', 'pat']),
    count: z.number().int().nonnegative(),
    sprint_changed: z.boolean(),
  }),
  custom_field_created: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    field_type: z.enum(CUSTOM_FIELD_TYPES),
    is_required: z.boolean(),
    has_default: z.boolean(),
    type_scoped: z.boolean(),
    option_count: z.number().int().nonnegative(),
  }),
  custom_field_archived: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    field_type: z.enum(CUSTOM_FIELD_TYPES),
  }),
  // One per issue write that changed custom field values.
  custom_field_values_set: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    field_count: z.number().int().positive(),
  }),
  work_item_attribute_created: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    value_count: z.number().int().nonnegative(),
  }),
  time_fields_changed: z.object({
    estimation: z.enum(['builtin', 'custom']),
    spent_time: z.enum(['builtin', 'custom']),
  }),
  board_created: z.object({
    via: z.enum(['session', 'pat']),
    columns: z.number().int().nonnegative(),
    swimlane_by: z.enum(['none', 'values', 'issues']),
  }),
  // At most once per user per board (or backlog) per UTC day: the pages poll, a day of polling is one use.
  board_viewed: z.object({
    via: z.enum(['session', 'pat']),
    swimlane_by: z.enum(['none', 'values', 'issues']),
    filtered: z.boolean(),
  }),
  backlog_viewed: z.object({ via: z.enum(['session', 'pat']) }),
  article_created: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    status: z.enum(['draft', 'published']),
    depth: z.number().int().positive(),
    tag_count: z.number().int().nonnegative(),
  }),
  article_published: z.object({ via: z.enum(['session', 'pat', 'mcp']) }),
  article_moved: z.object({ via: z.enum(['session', 'pat']), reparented: z.boolean() }),
  article_deleted: z.object({
    via: z.enum(['session', 'pat']),
    children: z.enum(['none', 'move_up', 'delete']),
    child_count: z.number().int().nonnegative(),
  }),
  article_restored: z.object({ via: z.enum(['session', 'pat']), restored_count: z.number().int().positive() }),
  // At most once per user per article per UTC day.
  article_viewed: z.object({ via: z.enum(['session', 'pat']) }),
  articles_searched: z.object({
    via: z.enum(['session', 'pat']),
    clause_count: z.number().int().nonnegative(),
    has_free_text: z.boolean(),
    result_count: z.number().int().nonnegative(),
  }),
  global_searched: z.object({
    via: z.enum(['session', 'pat']),
    issue_count: z.number().int().nonnegative(),
    article_count: z.number().int().nonnegative(),
  }),
  // At most once per user per report per UTC day; never the query, labels or names.
  report_viewed: z.object({
    report: z.enum(REPORT_NAMES),
    via: z.enum(['session', 'pat', 'mcp']),
    empty: z.boolean(),
    cached: z.boolean(),
    group_count: z.number().int().nonnegative(),
    project_count: z.number().int().nonnegative(),
  }),
  report_exported: z.object({ report: z.enum(REPORT_NAMES), via: z.enum(['session', 'pat', 'mcp']) }),
  // Phase 6a. Kinds and counts only: never an issue, a title or an address.
  notification_preferences_changed: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    all_off: z.boolean(),
    changed: z.number().int().nonnegative(),
    instant: z.number().int().nonnegative(),
    daily_digest: z.number().int().nonnegative(),
    weekly_digest: z.number().int().nonnegative(),
  }),
  notifications_read: z.object({
    via: z.enum(['session', 'pat', 'mcp']),
    how: z.enum(['one', 'subject', 'all']),
    count: z.number().int().nonnegative(),
  }),
  notification_email_sent: z.object({
    kinds: z.array(z.enum(NOTIFICATION_KINDS)),
    count: z.number().int().positive(),
  }),
  digest_sent: z.object({
    cadence: z.enum(DIGEST_CADENCES),
    notifications: z.number().int().positive(),
    projects: z.number().int().positive(),
    kinds: z.number().int().positive(),
  }),
  email_unsubscribed: z.object({
    scope: z.enum(['kind', 'daily_digest', 'weekly_digest']),
    kind: z.enum(NOTIFICATION_KINDS).optional(),
    one_click: z.boolean(),
  }),
  // One per MCP tool call. Tool names and error codes are ours, never the caller's text; arguments are only counted.
  two_factor_enabled: z.object({}),
  two_factor_disabled: z.object({ with_recovery_code: z.boolean() }),
  recovery_code_used: z.object({ remaining: z.number().int().nonnegative() }),
  recovery_codes_regenerated: z.object({}),
  account_deactivated: z.object({ by: z.enum(['self', 'operator']) }),
  account_reactivated: z.object({}),
  org_deletion_scheduled: z.object({ members: z.number().int().nonnegative() }),
  org_deletion_cancelled: z.object({ days_left: z.number().int().nonnegative() }),
  org_deleted: z.object({
    projects: z.number().int().nonnegative(),
    issues: z.number().int().nonnegative(),
    objects_deleted: z.number().int().nonnegative(),
  }),
  ownership_transfer_started: z.object({ replaced: z.boolean() }),
  ownership_transferred: z.object({ seconds_to_accept: z.number().nonnegative() }),
  avatar_mirrored: z.object({ provider: z.enum(['google', 'github']) }),
  byo_storage_connected: z.object({ provider: z.enum(BYO_PROVIDERS), rotated: z.boolean() }),
  byo_storage_check_failed: z.object({
    provider: z.enum(BYO_PROVIDERS),
    step: z.enum(BYO_CHECK_STEPS),
    reason: z.enum(BYO_CHECK_REASONS),
  }),
  byo_storage_failed: z.object({
    provider: z.enum(BYO_PROVIDERS),
    step: z.enum(BYO_CHECK_STEPS),
    reason: z.enum(BYO_CHECK_REASONS),
  }),
  byo_storage_migration_started: z.object({
    provider: z.enum(BYO_PROVIDERS),
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    retry: z.boolean(),
  }),
  byo_storage_migration_finished: z.object({
    provider: z.enum(BYO_PROVIDERS),
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    seconds: z.number().nonnegative(),
  }),
  byo_storage_migration_failed: z.object({
    provider: z.enum(BYO_PROVIDERS),
    files_moved: z.number().int().nonnegative(),
    step: z.enum(BYO_CHECK_STEPS),
    reason: z.enum(BYO_CHECK_REASONS),
  }),
  byo_storage_disconnected: z.object({
    provider: z.enum(BYO_PROVIDERS),
    files_left: z.number().int().nonnegative(),
    bytes_left: z.number().int().nonnegative(),
    days_connected: z.number().nonnegative(),
  }),
  storage_reconciled: z.object({
    drift_bytes: z.number().int(),
  }),
  mcp_tool_called: z.object({
    tool: z.string().regex(/^[a-z_]{1,64}$/),
    ok: z.boolean(),
    error_code: z
      .string()
      .regex(/^[a-z_.]{1,100}$/)
      .nullable(),
    duration_ms: z.number().nonnegative(),
    argument_count: z.number().int().nonnegative(),
    api_calls: z.number().int().nonnegative(),
  }),
} as const;

export type EventName = keyof typeof EventCatalogue;

// POSTHOG_SAMPLE_RATE thins only these; sampling a funnel step would cut it twice.
export const SAMPLED_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  'api_request',
  'issues_searched',
  'articles_searched',
  'global_searched',
]);
export type EventProps<N extends EventName> = z.infer<(typeof EventCatalogue)[N]>;
