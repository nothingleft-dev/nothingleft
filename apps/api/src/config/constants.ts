export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_PER_SESSION = 300;
export const RATE_LIMIT_MAX_PER_PAT = 600; // agents burst in ways humans do not - docs/architecture.md#security-posture
export const RATE_LIMIT_MAX_ANONYMOUS = 60;

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_BODY_LIMIT_BYTES = 1 * 1024 * 1024;

export const HEALTH_CHECK_TIMEOUT_MS = 3_000;
export const HEALTH_DEEP_MAX_PER_MINUTE = 10;
export const HEALTH_DEEP_MEMO_MS = 5_000;

// Browsers hide every non-safelisted response header unless it is named here.
export const CORS_EXPOSED_HEADERS = [
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
  'content-disposition',
  'idempotent-replayed',
] as const;

export const SESSION_ROLLING_REFRESH_MS = 24 * 60 * 60 * 1000; // docs/auth-and-tenancy.md#rolling-expiry
export const PAT_LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;
export const GRAVATAR_PROBE_TIMEOUT_MS = 2_000;
export const BREACH_CHECK_TIMEOUT_MS = 2_000;
export const EMAIL_SEND_TIMEOUT_MS = 10_000;
export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const ASSET_BASE_URL = 'https://static.nothingleft.dev';
export const ZOHO_EMAIL_ENDPOINT = 'https://cpaas.zoho.com/v1.1/email';
export const JOB_GC_CRON = '0 * * * *'; // hourly: session.gc, tokens.gc
export const JOB_PURGE_CRON = '0 3 * * *'; // nightly, 03:00 UTC: issues.purge
export const JOB_SWEEP_CRON = '30 * * * *'; // hourly, off the gc minute: attachments.sweep
export const JOB_SNAPSHOT_CRON = '5 0 * * *'; // nightly, 00:05 UTC: sprint.snapshot for the day just ended
export const JOB_DIGEST_CRON = '5 * * * *'; // hourly: email.digest for whoever it is 9am for
export const JOB_DUE_CRON = '10 * * * *'; // hourly: notifications.due
export const JOB_NOTIFICATIONS_PURGE_CRON = '15 3 * * *'; // nightly, 03:15 UTC: notifications.purge
// A fan-out that reruns within this long skips nothing; the dedupe key absorbs the overlap.
export const FANOUT_SINCE_MARGIN_MS = 60_000;
export const DUE_OVERDUE_GRACE_DAYS = 3;
export const DIGEST_ISSUES_PER_LINE = 5;
export const ATTACHMENT_PENDING_TTL_MS = 60 * 60 * 1000; // docs/file-storage.md#upload
export const ATTACHMENT_SWEEP_BATCH = 500;
// Just under the presigned URL's five minutes, so a cached redirect never outlives its signature.
export const ATTACHMENT_REDIRECT_MAX_AGE_SECONDS = 240;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'idempotent-replayed';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';
export const OAUTH_REQUEST_TIMEOUT_MS = 10_000;

export const ACTIVITY_EXPORT_MAX_ROWS = 50_000;
export const ACTIVITY_EXPORT_PAGE_SIZE = 1_000;

// The one copy of these values outside design/tokens.css: generated marks are SVGs rendered by
// the API, which cannot read the stylesheet - design/DESIGN-SYSTEM.md § 3.4.
export const AVATAR_PASTEL_BACKGROUNDS = ['ffe3ea', 'e3edff', 'e2f5e9', 'fdf1d4', 'efe6ff'] as const;
export const AVATAR_INITIALS_TEXT = '151618';
// Project marks: loud on purpose, so a project reads apart from a person at a glance.
export const AVATAR_ELECTRIC_BACKGROUNDS = ['ff2e88', '00e5ff', 'ffe600', '7cff00', 'ff6a00', 'b400ff'] as const;
// Longer than any name, key or organisation name a mark is seeded from.
export const AVATAR_SEED_MAX_LENGTH = 200;
// A mark is a pure function of its URL, so it never needs revalidating.
export const AVATAR_CACHE_SECONDS = 365 * 24 * 60 * 60;

export const ISSUE_EXPORT_MAX_ROWS = 10_000;
export const ISSUE_EXPORT_PAGE_SIZE = 500;
export const RECENT_SEARCHES_KEPT = 20;
export const RECENT_SEARCH_COALESCE_MS = 5 * 60 * 1000;
export const SUGGEST_VALUES_MAX = 10;

// Bounds how stale "now" can be in the age report; writes invalidate sooner through the data version.
export const REPORT_CACHE_TTL_SECONDS = 5 * 60;

export const TOTP_ISSUER = 'Nothing Left';
// One 30-second step either side, for a phone clock that drifts.
export const TOTP_EPOCH_TOLERANCE_SECONDS = 30;
export const TWO_FACTOR_CHALLENGE_COOKIE_NAME = 'tfa';
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;
export const TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS = 5;
export const JOB_ORG_DELETION_REMINDER_CRON = '40 * * * *'; // hourly: org.deletion_reminder
export const JOB_ORG_DELETE_CRON = '45 * * * *'; // hourly: org.delete, past the grace period
export const ORG_DELETE_BATCH = 500;
export const AVATAR_MIRROR_TIMEOUT_MS = 5_000;
// Provider photos come from these hosts only; anything else is never fetched server-side.
export const AVATAR_MIRROR_HOSTS = ['googleusercontent.com', 'avatars.githubusercontent.com'] as const;
export const BYO_CONNECT_TIMEOUT_MS = 5_000;
// Socket idle time, not the whole request: copying a 100MB file may take longer than this in total.
export const BYO_REQUEST_TIMEOUT_MS = 30_000;
export const BYO_CHECK_TTL_SECONDS = 10 * 60;
export const JOB_RECONCILE_CRON = '30 3 * * *'; // nightly, 03:30 UTC: storage.reconcile
export const MIGRATION_BATCH = 50;
// One storage.migrate run moves at most this much, then queues the next: pg-boss expires a job after 15 minutes.
export const MIGRATION_RUN_FILES = 500;
export const MIGRATION_RUN_MS = 5 * 60 * 1000;
// One import.csv run stops after this long and queues the next, which resumes at the first unwritten row.
export const IMPORT_RUN_MS = 5 * 60 * 1000;
export const IMPORT_JOBS_LISTED = 20;
export const EXPORT_JOBS_LISTED = 20;
export const EXPORT_PAGE_SIZE = 500;
// export.org streams every file of an organisation, which can take far longer than pg-boss's 15 minutes.
export const EXPORT_JOB_EXPIRE_SECONDS = 6 * 60 * 60;
export const JOB_TRANSFER_SWEEP_CRON = '50 * * * *'; // hourly: transfers.sweep, expired exports and spent import files
export const TRANSFER_SWEEP_BATCH = 200;
