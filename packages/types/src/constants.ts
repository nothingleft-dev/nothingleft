export const SESSION_COOKIE_NAME = 'sid';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // docs/auth-and-tenancy.md#the-cookie
export const SESSION_CACHE_TTL_SECONDS = 60;

export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const PAT_PREFIX = 'nl_pat_'; // docs/auth-and-tenancy.md#personal-access-tokens
export const PAT_DISPLAY_PREFIX_LENGTH = 8;
export const PAT_SCOPES = [
  'issues:read',
  'issues:write',
  'comments:write',
  'time:write',
  'admin:project',
  'admin:org',
] as const;
export type PatScope = (typeof PAT_SCOPES)[number];

export const ORG_ROLES = ['org_admin', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const USER_THEMES = ['light', 'dark', 'system'] as const;
export type UserTheme = (typeof USER_THEMES)[number];

export const ORG_PLANS = ['free', 'pro', 'pro_lite', 'unlimited'] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

export const PROJECT_ROLES = ['project_admin', 'contributor', 'observer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ONE_TIME_TOKEN_PURPOSES = [
  'password_reset',
  'email_verify',
  'email_change',
  'ownership_transfer',
] as const;
export type OneTimeTokenPurpose = (typeof ONE_TIME_TOKEN_PURPOSES)[number];

export const INVITATION_KINDS = ['email', 'link'] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

export const ORG_ACTIVITY_KINDS = [
  'member_invited',
  'member_joined',
  'member_removed',
  'role_changed',
  'invite_created',
  'invite_revoked',
  'project_created',
  'project_archived',
  'project_deleted',
  'schema_changed',
  'custom_field_changed',
  'storage_connected',
  'storage_disconnected',
  'ownership_transferred',
  'org_settings_changed',
  'export_requested',
  'token_created',
  'token_revoked',
  'project_updated',
  'project_unarchived',
  'invite_rotated',
  'username_changed',
  'deletion_scheduled',
  'deletion_cancelled',
  'storage_updated',
  'tag_renamed',
  'tag_merged',
  'tag_deleted',
  'git_connection_created',
  'git_connection_removed',
  'git_connection_error',
  'repository_linked',
  'repository_unlinked',
] as const;
export type OrgActivityKind = (typeof ORG_ACTIVITY_KINDS)[number];

export const INVITATION_STATUSES = ['active', 'accepted', 'expired', 'exhausted', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
export const EMAIL_INVITATION_TTL_SECONDS = 14 * 24 * 60 * 60;
export const EMAIL_INVITATION_BATCH_MAX = 50;

// Token names only; the values live in design/tokens.css.
export const PALETTE_HUES = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'pink',
  'brown',
  'gray',
] as const;
export type PaletteHue = (typeof PALETTE_HUES)[number];

// The label grid for statuses, priorities and types: eight families × five steps, 1 palest
// to 5 deepest. Names only; background, text and dot values live in design/tokens.css.
export const LABEL_COLOR_FAMILIES = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'pink'] as const;
export type LabelColorFamily = (typeof LABEL_COLOR_FAMILIES)[number];
export type LabelColor = `${LabelColorFamily}-${1 | 2 | 3 | 4 | 5}`;
export const LABEL_COLORS = LABEL_COLOR_FAMILIES.flatMap(family =>
  [1, 2, 3, 4, 5].map(step => `${family}-${step}` as LabelColor),
) as unknown as readonly [LabelColor, ...LabelColor[]];
export const DEFAULT_LABEL_COLOR: LabelColor = 'gray-2';

export const PAGINATION_DEFAULT_LIMIT = 50;
export const PAGINATION_MAX_LIMIT = 200;

export const DEFAULT_WORKDAY_MINUTES = 480;
export const DEFAULT_WORKWEEK_DAYS = 5;
export const DEFAULT_WEEK_STARTS_ON = 1; // Monday, ISO-8601
export const WORKDAY_MINUTES_MAX = 24 * 60;
export const WORKWEEK_DAYS_MAX = 7;

export const FREE_SEAT_LIMIT_DEFAULT = 20;
export const FREE_STORAGE_BYTES_DEFAULT = 5 * 1024 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 8;
export const SIGN_IN_MAX_ATTEMPTS = 5;
export const SIGN_IN_LOCKOUT_SECONDS = 15 * 60;

export const ONE_TIME_TOKEN_TTL_SECONDS: Record<OneTimeTokenPurpose, number> = {
  password_reset: 60 * 60,
  email_verify: 24 * 60 * 60,
  email_change: 24 * 60 * 60,
  ownership_transfer: 7 * 24 * 60 * 60,
};

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];
export const AVATAR_PRESIGN_TTL_SECONDS = 15 * 60;

export const STATUS_CATEGORIES = ['backlog', 'unstarted', 'started', 'done', 'cancelled'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];
export const RESOLVED_STATUS_CATEGORIES: readonly StatusCategory[] = ['done', 'cancelled'];

export const ISSUE_ACTIVITY_KINDS = [
  'created',
  'field_changed',
  'commented',
  'comment_edited',
  'comment_deleted',
  'linked',
  'unlinked',
  'attached',
  'detached',
  'time_logged',
  'tagged',
  'untagged',
  'sprint_changed',
  'parent_changed',
  'deleted',
  'restored',
  'git_linked',
  'git_unlinked',
  'git_pr_changed',
] as const;
export type IssueActivityKind = (typeof ISSUE_ACTIVITY_KINDS)[number];

export const ISSUE_LINK_TYPES = ['relates', 'depends', 'duplicate', 'subtask'] as const;
export type IssueLinkType = (typeof ISSUE_LINK_TYPES)[number];
export const LINK_DIRECTIONS = ['outward', 'inward'] as const;
export type LinkDirection = (typeof LINK_DIRECTIONS)[number];

// Stored outward (from → to); rendered in both directions.
export const ISSUE_LINK_NAMES = [
  { name: 'relates to', type: 'relates', direction: 'outward' },
  { name: 'is required for', type: 'depends', direction: 'outward' },
  { name: 'depends on', type: 'depends', direction: 'inward' },
  { name: 'is duplicated by', type: 'duplicate', direction: 'outward' },
  { name: 'duplicates', type: 'duplicate', direction: 'inward' },
  { name: 'parent for', type: 'subtask', direction: 'outward' },
  { name: 'subtask of', type: 'subtask', direction: 'inward' },
] as const satisfies readonly { name: string; type: IssueLinkType; direction: LinkDirection }[];
export type IssueLinkName = (typeof ISSUE_LINK_NAMES)[number]['name'];
export const ISSUE_LINK_NAME_VALUES = ISSUE_LINK_NAMES.map(l => l.name) as unknown as readonly [
  IssueLinkName,
  ...IssueLinkName[],
];

// Epic → Task → Subtask.
export const ISSUE_HIERARCHY_MAX_DEPTH = 3;
export const ISSUE_LINK_MAX_TARGETS = 50;
export const ISSUE_TAGS_MAX_PER_REQUEST = 50;
export const TAG_NAME_MAX_LENGTH = 100;
export const ISSUE_REF_PICKER_LIMIT = 10;

export const WATCHER_SOURCES = ['explicit', 'auto'] as const;
export type WatcherSource = (typeof WATCHER_SOURCES)[number];

export const REACTION_EMOJIS = ['👍', '👎', '🎉', '👀', '❤️'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const MENTION_SOURCE_TYPES = ['issue', 'comment', 'work_item', 'article'] as const;
export type MentionSourceType = (typeof MENTION_SOURCE_TYPES)[number];

export const SPRINT_STATES = ['planned', 'active', 'completed'] as const;
export type SprintState = (typeof SPRINT_STATES)[number];
export const SPRINT_NAME_MAX_LENGTH = 100;
export const SPRINT_GOAL_MAX_BYTES = 16 * 1024;
export const STORY_POINTS_MAX = 999;

export const BOARD_COLUMN_FIELDS = ['status', 'priority', 'type'] as const;
export type BoardColumnField = (typeof BOARD_COLUMN_FIELDS)[number];
export const BOARD_SWIMLANES = ['none', 'values', 'issues'] as const;
export type BoardSwimlane = (typeof BOARD_SWIMLANES)[number];
export const BOARD_SWIMLANE_FIELDS = ['assignee', 'priority', 'type'] as const;
export type BoardSwimlaneField = (typeof BOARD_SWIMLANE_FIELDS)[number];
export const BOARD_NAME_MAX_LENGTH = 100;
export const BOARD_COLUMNS_MAX = 20;
export const BOARD_WIP_MAX = 999;
export const BOARD_CARDS_MAX = 500;
export const BACKLOG_MOVE_MAX_ISSUES = 100;

// The serialised size of `user_preferences.ui` after a merge.
export const USER_UI_PREFERENCES_MAX_BYTES = 16 * 1024;

export const ARTICLE_STATUSES = ['draft', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
export const ARTICLE_HIERARCHY_MAX_DEPTH = 3;
export const ARTICLE_SLUG_MAX_LENGTH = 80;
export const ARTICLE_RESTORE_WINDOW_DAYS = 14;
// What deleting an article with children does to them; the caller must choose.
export const ARTICLE_CHILDREN_ON_DELETE = ['move_up', 'delete'] as const;
export type ArticleChildrenOnDelete = (typeof ARTICLE_CHILDREN_ON_DELETE)[number];
export const TAG_CONTEXTS = ['issue', 'article'] as const;
export type TagContext = (typeof TAG_CONTEXTS)[number];
export const GLOBAL_SEARCH_DEFAULT_LIMIT = 5;
export const GLOBAL_SEARCH_MAX_LIMIT = 50;

export const SAVED_VIEW_VISIBILITIES = ['private', 'project', 'org'] as const;
export type SavedViewVisibility = (typeof SAVED_VIEW_VISIBILITIES)[number];
export const SAVED_VIEW_NAME_MAX = 100;

export const ISSUE_GROUP_FIELDS = [
  'project',
  'status',
  'priority',
  'type',
  'assignee',
  'tag',
  'sprint',
  'due',
] as const;
export type IssueGroupField = (typeof ISSUE_GROUP_FIELDS)[number];
// A custom field groups as `custom:<slug>`: select, multi-select, user, multi-user, checkbox.
export const CUSTOM_GROUP_PREFIX = 'custom:';
export type IssueGroupBy = IssueGroupField | `custom:${string}`;
export const REPORT_NAMES = [
  'issues-per-assignee',
  'issues-per-project',
  'issues-per-field',
  'matrix',
  'burndown',
  'average-age',
  'time',
  'gantt',
  'timesheet',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];
// Chart series before the rest fold into Other (DESIGN-SYSTEM § 3.5).
export const REPORT_SERIES_MAX = 8;
export const REPORT_MAX_GROUPS = 500;
export const REPORT_MATRIX_MAX_AXIS = 50;
export const REPORT_GANTT_MAX_BARS = 500;
export const REPORT_TIMESHEET_MAX_DAYS = 62;
export const REPORT_TIME_MAX_DAYS = 366;
export const REPORT_MAX_USERS = 200;
export const REPORT_MAX_PROJECTS = 100;
export const DUE_BUCKETS = ['overdue', 'today', 'this_week', 'later'] as const;
export type DueBucket = (typeof DUE_BUCKETS)[number];
export const BULK_UPDATE_MAX_ISSUES = 500;
export const ISSUE_CSV_COLUMNS = [
  'key',
  'title',
  'project',
  'status',
  'priority',
  'type',
  'assignees',
  'created_by',
  'created_at',
  'updated_at',
  'resolved_at',
  'start_date',
  'due_date',
  'estimation',
  'spent_time',
  'story_points',
  'sprint',
  'vote_count',
] as const;
export type IssueCsvColumn = (typeof ISSUE_CSV_COLUMNS)[number];
// Any custom field is also a column, as `custom:<slug>`.
export type IssueCsvColumnInput = IssueCsvColumn | `custom:${string}`;

export const STORAGE_TARGETS = ['platform', 'byo'] as const;
export type StorageTarget = (typeof STORAGE_TARGETS)[number];

export const BYO_PROVIDERS = ['r2', 's3'] as const;
export type ByoProvider = (typeof BYO_PROVIDERS)[number];
export const R2_JURISDICTIONS = ['default', 'eu', 'fedramp'] as const;
export type R2Jurisdiction = (typeof R2_JURISDICTIONS)[number];
export const BYO_STATUSES = ['pending', 'verified', 'failed'] as const;
export type ByoStatus = (typeof BYO_STATUSES)[number];
export const BYO_MIGRATION_STATES = ['idle', 'running', 'done', 'failed'] as const;
export type ByoMigrationState = (typeof BYO_MIGRATION_STATES)[number];
// Where a check against the customer's bucket stopped, and why.
export const BYO_CHECK_STEPS = ['connect', 'put', 'get', 'delete', 'browser'] as const;
export type ByoCheckStep = (typeof BYO_CHECK_STEPS)[number];
export const BYO_CHECK_REASONS = [
  'invalid_key',
  'wrong_secret',
  'no_bucket',
  'access_denied',
  'wrong_region',
  'unreachable',
  'mismatch',
  'unknown',
] as const;
export type ByoCheckReason = (typeof BYO_CHECK_REASONS)[number];
export const BYO_CHECK_OBJECT_BYTES = 8 * 1024;
export const BYO_SECRET_MASK = '••••••••';
export const BYO_MIGRATION_STALL_MINUTES = 30;
export const STORAGE_FILES_PAGE_MAX = 100;
export const STORAGE_FILES_PAGE_DEFAULT = 50;

export const ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;
export const ATTACHMENTS_PER_ISSUE_MAX = 50;
export const ATTACHMENTS_PER_ARTICLE_MAX = 50;
export const ATTACHMENT_FILENAME_MAX_LENGTH = 255;
export const ATTACHMENT_UPLOAD_TTL_SECONDS = 15 * 60;
export const ATTACHMENT_DOWNLOAD_TTL_SECONDS = 5 * 60;
export const ATTACHMENT_DRAFT_TTL_DAYS = 2;
// Served inline; every other type downloads, SVG included, so nothing uploaded can run script.
export const ATTACHMENT_INLINE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
] as const;
export const ATTACHMENT_STATUSES = ['pending', 'ready'] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUSES)[number];

export const STORAGE_LEVELS = ['ok', 'warning', 'critical', 'full'] as const;
export type StorageLevel = (typeof STORAGE_LEVELS)[number];
export const STORAGE_WARNING_PERCENT = 80;
export const STORAGE_CRITICAL_PERCENT = 95;
export const STORAGE_NOTICE_LEVELS = [0, 95, 100] as const;
export type StorageNoticeLevel = (typeof STORAGE_NOTICE_LEVELS)[number];

export const ISSUE_TITLE_MAX_LENGTH = 500;
export const ISSUE_RESTORE_WINDOW_DAYS = 14;
export const ACTIVITY_COALESCE_WINDOW_MS = 5 * 60 * 1000;
export const CONFIG_NAME_MAX_LENGTH = 60;

export const MARKDOWN_SOFT_LIMIT_BYTES = 64 * 1024;
export const MARKDOWN_HARD_LIMIT_BYTES = 256 * 1024;

export const WORK_ITEM_NOTE_MAX_BYTES = 16 * 1024;
export const WORK_ITEM_MAX_RECORDS = 20;
export const WORK_ITEM_RANGE_MAX_DAYS = 62;

export const CUSTOM_FIELD_TYPES = [
  'text',
  'markdown',
  'number',
  'integer',
  'date',
  'datetime',
  'checkbox',
  'select',
  'multi_select',
  'user',
  'multi_user',
  'url',
  'duration',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

// What a value is, for the query language and for the one-slug-one-kind rule.
export const CUSTOM_FIELD_KINDS = {
  text: 'text',
  markdown: 'text',
  url: 'text',
  number: 'number',
  integer: 'number',
  duration: 'duration',
  date: 'date',
  datetime: 'datetime',
  checkbox: 'checkbox',
  select: 'option',
  multi_select: 'option',
  user: 'person',
  multi_user: 'person',
} as const satisfies Record<CustomFieldType, string>;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[CustomFieldType];

export const CUSTOM_FIELD_OPTION_TYPES = ['select', 'multi_select'] as const satisfies readonly CustomFieldType[];
export const CUSTOM_FIELD_MULTI_TYPES = ['multi_select', 'multi_user'] as const satisfies readonly CustomFieldType[];
export const CUSTOM_FIELD_TIME_ROLES = ['estimation', 'spent_time'] as const;
export type CustomFieldTimeRole = (typeof CUSTOM_FIELD_TIME_ROLES)[number];

export const CUSTOM_FIELDS_MAX = 50;
export const CUSTOM_FIELD_OPTIONS_MAX = 200;
export const CUSTOM_FIELD_MULTI_MAX = 50;
export const CUSTOM_FIELD_SLUG_MAX = 40;
export const CUSTOM_FIELD_TEXT_MAX = 1000;
export const CUSTOM_FIELD_URL_MAX = 2000;
export const CUSTOM_FIELD_MARKDOWN_MAX_BYTES = 16 * 1024;
export const CUSTOM_FIELD_DECIMALS_MAX = 6;

export const WORK_ITEM_ATTRIBUTES_MAX = 10;
export const WORK_ITEM_ATTRIBUTE_VALUES_MAX = 50;

export const NOTIFICATION_KINDS = [
  'assigned',
  'unassigned',
  'mentioned',
  'commented',
  'status_changed',
  'resolved',
  'linked',
  'due_soon',
  'overdue',
  'time_logged',
  'sprint_started',
  'sprint_finished',
  'article_published',
  'article_updated',
  'reaction',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_AREAS = ['issues', 'comments', 'agile', 'knowledge_base'] as const;
export type NotificationArea = (typeof NOTIFICATION_AREAS)[number];

export const NOTIFICATION_KIND_AREAS = {
  assigned: 'issues',
  unassigned: 'issues',
  status_changed: 'issues',
  resolved: 'issues',
  linked: 'issues',
  due_soon: 'issues',
  overdue: 'issues',
  time_logged: 'issues',
  mentioned: 'comments',
  commented: 'comments',
  reaction: 'comments',
  sprint_started: 'agile',
  sprint_finished: 'agile',
  article_published: 'knowledge_base',
  article_updated: 'knowledge_base',
} as const satisfies Record<NotificationKind, NotificationArea>;

export const NOTIFICATION_EMAIL_OPTIONS = ['off', 'instant', 'daily_digest', 'weekly_digest'] as const;
export type NotificationEmail = (typeof NOTIFICATION_EMAIL_OPTIONS)[number];
// Nobody needs an email about a 👍.
export const NOTIFICATION_IN_APP_ONLY_KINDS = ['reaction'] as const satisfies readonly NotificationKind[];
// The preferences screen marks it rather than leaving people to discover it.
export const NOTIFICATION_MOST_COMMONLY_ENABLED: NotificationKind = 'mentioned';

export const DIGEST_CADENCES = ['daily', 'weekly'] as const;
export type DigestCadence = (typeof DIGEST_CADENCES)[number];
export const DIGEST_LOCAL_HOUR = 9;
// 1 = Monday, as Date.getDay() in the recipient's timezone.
export const DIGEST_WEEKLY_DAY = 1;

// Fan-out waits past the 5-minute coalescing window, so every row it reads has settled (owner, 27 Sep 2026).
export const NOTIFICATION_FANOUT_DELAY_MS = 10 * 60 * 1000;
export const NOTIFICATIONS_READ_RETENTION_DAYS = 30;
export const NOTIFICATIONS_UNREAD_RETENTION_DAYS = 90;
export const NOTIFICATION_GROUP_PREVIEW = 10;
export const NOTIFICATIONS_MARK_MAX = 500;

export const RECOVERY_CODE_COUNT = 10;
// An account with no password confirms a destructive action by having signed in this recently.
export const STEP_UP_RECENT_SIGN_IN_SECONDS = 10 * 60;

export const ORG_DELETION_GRACE_DAYS = 14;

export const IMPORT_SOURCES = ['csv'] as const;
export const IMPORT_STATUSES = [
  'awaiting_upload',
  'ready',
  'queued',
  'running',
  'completed',
  'failed',
  'expired',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const IMPORT_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'type',
  'assignees',
  'estimate',
  'story_points',
  'start_date',
  'due_date',
  'tags',
  'sprint',
  'parent',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const CSV_IMPORT_MAX_ROWS = 10_000;
export const CSV_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
export const CSV_IMPORT_SAMPLE_ROWS = 5;
// Beyond this the job keeps counting failed rows but stops listing them.
export const CSV_IMPORT_ERRORS_KEPT = 1_000;
// An upload never completed, or a file never run, is swept after this long.
export const CSV_IMPORT_ABANDONED_HOURS = 24;

export const EXPORT_SCOPES = ['org'] as const;
export const EXPORT_FORMATS = ['json'] as const;
export const EXPORT_STATUSES = ['queued', 'running', 'completed', 'failed', 'expired'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];
export const ORG_EXPORT_TTL_DAYS = 7;
export const ORG_EXPORT_FORMAT_VERSION = 1;

export const TAG_MERGE_MAX_SOURCES = 50;

export const GIT_AUTH_KINDS = ['app_installation', 'token', 'manual'] as const;
export type GitAuthKind = (typeof GIT_AUTH_KINDS)[number];
export const GIT_CONNECT_KINDS = ['app', 'token', 'manual'] as const;
export type GitConnectKind = (typeof GIT_CONNECT_KINDS)[number];
export const GIT_CONNECTION_STATUSES = ['active', 'suspended', 'token_expired', 'failing', 'revoked'] as const;
export type GitConnectionStatus = (typeof GIT_CONNECTION_STATUSES)[number];
// What went wrong, as the connection card says it; `last_error` holds one of these.
export const GIT_CONNECTION_ERRORS = [
  'signature',
  'processing',
  'token_invalid',
  'token_expired',
  'suspended',
  'uninstalled',
] as const;
export type GitConnectionError = (typeof GIT_CONNECTION_ERRORS)[number];
export const GIT_CONNECTION_HEALTH = [
  'active',
  'failing',
  'token_expired',
  'expiring',
  'suspended',
  'removed_at_provider',
  'disconnected',
] as const;
export type GitConnectionHealth = (typeof GIT_CONNECTION_HEALTH)[number];
export const GIT_WEBHOOK_STATUSES = ['active', 'failing', 'missing', 'not_applicable'] as const;
export type GitWebhookStatus = (typeof GIT_WEBHOOK_STATUSES)[number];
export const GIT_EVENT_STATUSES = ['pending', 'done', 'ignored', 'failed'] as const;
export type GitEventStatus = (typeof GIT_EVENT_STATUSES)[number];
// Why an event ended `failed`, as stored in its `error` and counted in analytics.
export const GIT_EVENT_FAILURES = [
  'provider_unreachable',
  'provider_rate_limited',
  'token_invalid',
  'payload_truncated',
  'internal',
] as const;
export type GitEventFailure = (typeof GIT_EVENT_FAILURES)[number];
// Why an event ended `ignored`.
export const GIT_EVENT_IGNORED = [
  'repository_unknown',
  'repository_not_linked',
  'connection_revoked',
  'event_unused',
] as const;
export type GitEventIgnored = (typeof GIT_EVENT_IGNORED)[number];
export const GIT_BACKFILL_STATES = ['queued', 'running', 'done', 'failed'] as const;
export type GitBackfillState = (typeof GIT_BACKFILL_STATES)[number];
export const GIT_EVENT_ATTEMPTS_MAX = 5;
export const GIT_TOKEN_EXPIRY_WARNING_DAYS = 7;
export const GIT_MERGE_BASE_BRANCHES_MAX = 20;
export const GIT_PAGE_DEFAULT = 50;
export const GIT_PAGE_MAX = 100;

export const GIT_PULL_REQUEST_STATES = ['draft', 'open', 'merged', 'closed'] as const;
export type GitPullRequestState = (typeof GIT_PULL_REQUEST_STATES)[number];
export const GIT_REVIEW_STATES = ['none', 'review_requested', 'approved', 'changes_requested'] as const;
export type GitReviewState = (typeof GIT_REVIEW_STATES)[number];
export const GIT_REVIEWER_STATES = ['requested', 'approved', 'changes_requested', 'commented', 'dismissed'] as const;
export type GitReviewerState = (typeof GIT_REVIEWER_STATES)[number];
export const GIT_CI_STATES = ['none', 'running', 'passing', 'failing'] as const;
export type GitCiState = (typeof GIT_CI_STATES)[number];
export const GIT_CHECK_STATUSES = ['queued', 'in_progress', 'completed'] as const;
export type GitCheckStatus = (typeof GIT_CHECK_STATUSES)[number];
export const GIT_CHECK_CONCLUSIONS = [
  'success',
  'failure',
  'neutral',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
  'stale',
] as const;
export type GitCheckConclusion = (typeof GIT_CHECK_CONCLUSIONS)[number];
export const GIT_LINK_TARGETS = ['branch', 'commit', 'pull_request'] as const;
export type GitLinkTarget = (typeof GIT_LINK_TARGETS)[number];
export const GIT_LINK_INTENTS = ['mention', 'closes', 'revert'] as const;
export type GitLinkIntent = (typeof GIT_LINK_INTENTS)[number];
export const GIT_LINK_SOURCES = [
  'branch_name',
  'commit_message',
  'pr_title',
  'pr_body',
  'pr_commits',
  'merge_commit',
  'manual',
] as const;
export type GitLinkSource = (typeof GIT_LINK_SOURCES)[number];
export const GIT_IDENTITY_VERIFICATIONS = ['provider', 'email', 'claim'] as const;
export type GitIdentityVerification = (typeof GIT_IDENTITY_VERIFICATIONS)[number];
// The issue-level badge; a list sorted by development follows this order.
export const GIT_DEVELOPMENT_ROLLUPS = [
  'merged',
  'ci_failing',
  'changes_requested',
  'approved',
  'in_review',
  'draft',
  'branch_active',
  'reverted',
  'none',
] as const;
export type GitDevelopmentRollup = (typeof GIT_DEVELOPMENT_ROLLUPS)[number];
export const GIT_BACKFILL_DAYS = 90;
export const GIT_BACKFILL_PULL_REQUESTS_MAX = 1_000;
export const GIT_PUSH_COMMITS_MAX = 100;
export const GIT_COMMIT_MESSAGE_STORED_MAX = 4_096;
