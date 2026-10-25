import type {
  AutomationRunResult,
  AutomationSkipReason,
  GitCheckConclusion,
  GitCheckStatus,
  GitCiState,
  GitConnectionError,
  GitConnectionHealth,
  GitDevelopmentRollup,
  GitEventStatus,
  GitLinkSource,
  GitProviderKind,
  GitPullRequestState,
  GitReviewState,
  GitReviewerState,
  GitWebhookStatus,
  StatusCategory,
} from '@nothingleft/types';

export type Hue = 'green' | 'red' | 'amber' | 'gray' | 'orange' | 'blue';

// The badge's colours follow plan § 13 D: done is green, blocked red, moving yellow, idle gray.
export const ROLLUP: Record<GitDevelopmentRollup, { label: string; hue: Hue }> = {
  merged: { label: 'Merged', hue: 'green' },
  ci_failing: { label: 'CI failing', hue: 'red' },
  changes_requested: { label: 'Changes requested', hue: 'red' },
  approved: { label: 'Approved', hue: 'green' },
  in_review: { label: 'In review', hue: 'amber' },
  draft: { label: 'Draft', hue: 'gray' },
  branch_active: { label: 'Branch active', hue: 'amber' },
  reverted: { label: 'Reverted', hue: 'orange' },
  none: { label: 'Nothing linked', hue: 'gray' },
};

export const PR_STATE: Record<GitPullRequestState, { label: string; hue: Hue }> = {
  open: { label: 'Open', hue: 'green' },
  draft: { label: 'Draft', hue: 'gray' },
  merged: { label: 'Merged', hue: 'blue' },
  closed: { label: 'Closed', hue: 'red' },
};

export const CI_STATE: Record<GitCiState, { label: string; hue: Hue }> = {
  passing: { label: 'CI passing', hue: 'green' },
  failing: { label: 'CI failing', hue: 'red' },
  running: { label: 'CI running', hue: 'amber' },
  none: { label: 'No checks', hue: 'gray' },
};

export const REVIEW_STATE: Record<GitReviewState, string> = {
  none: 'No review',
  review_requested: 'Review requested',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

export const REVIEWER_STATE: Record<GitReviewerState, { label: string; hue: Hue }> = {
  requested: { label: 'review requested', hue: 'gray' },
  approved: { label: 'approved', hue: 'green' },
  changes_requested: { label: 'requested changes', hue: 'red' },
  commented: { label: 'commented', hue: 'gray' },
  dismissed: { label: 'review dismissed', hue: 'gray' },
};

export function checkTone(status: GitCheckStatus, conclusion: GitCheckConclusion | null): { label: string; hue: Hue } {
  if (status !== 'completed') return { label: status === 'queued' ? 'Queued' : 'Running', hue: 'amber' };
  switch (conclusion) {
    case 'success':
      return { label: 'Passed', hue: 'green' };
    case 'neutral':
    case 'skipped':
    case 'stale':
      return {
        label: conclusion === 'neutral' ? 'Neutral' : conclusion === 'skipped' ? 'Skipped' : 'Stale',
        hue: 'gray',
      };
    case 'cancelled':
      return { label: 'Cancelled', hue: 'red' };
    case 'timed_out':
      return { label: 'Timed out', hue: 'red' };
    case 'action_required':
      return { label: 'Action required', hue: 'red' };
    default:
      return { label: 'Failed', hue: 'red' };
  }
}

export const LINK_SOURCE: Record<GitLinkSource, string> = {
  branch_name: 'the branch name',
  commit_message: 'a commit message',
  pr_title: 'the title',
  pr_body: 'the description',
  pr_commits: 'its commits',
  merge_commit: 'the merge commit',
  manual: 'a link added by hand',
};

export const HEALTH: Record<GitConnectionHealth, { label: string; hue: Hue }> = {
  active: { label: 'Active', hue: 'green' },
  failing: { label: 'Failing', hue: 'red' },
  token_expired: { label: 'Token expired', hue: 'red' },
  expiring: { label: 'Token expiring', hue: 'amber' },
  suspended: { label: 'Suspended', hue: 'amber' },
  removed_at_provider: { label: 'Removed at provider', hue: 'red' },
  disconnected: { label: 'Disconnected', hue: 'gray' },
};

// The API's git.connection_reason.* sentences, which finish "This connection needs attention: …".
export const CONNECTION_REASON: Record<GitConnectionError, string> = {
  signature:
    'its webhook deliveries are failing the signature check, which usually means the secret was changed at the provider',
  processing: 'its webhook deliveries keep failing to process',
  token_invalid: 'the provider refused its access token',
  token_expired: 'its access token has expired',
  suspended: 'the installation was suspended at the provider',
  uninstalled: 'the app was uninstalled at the provider',
};

export const WEBHOOK_STATUS: Record<GitWebhookStatus, { label: string; hue: Hue }> = {
  active: { label: 'Webhook active', hue: 'green' },
  failing: { label: 'Webhook failing', hue: 'red' },
  missing: { label: 'Webhook missing', hue: 'amber' },
  not_applicable: { label: 'Delivered by the app', hue: 'gray' },
};

export const EVENT_STATUS: Record<GitEventStatus, string> = {
  pending: 'Pending',
  done: 'Done',
  ignored: 'Ignored',
  failed: 'Failed',
};

// The API's git.event_reason.* catalogue: an event's `error` is one of these codes.
const EVENT_REASON: Record<string, string> = {
  repository_unknown: 'The repository is not known to this connection.',
  repository_removed: 'The repository was no longer available to the connection when this arrived.',
  connection_suspended: 'The installation was suspended at the provider when this arrived.',
  repository_not_linked: 'The repository is not linked to any project.',
  connection_revoked: 'The connection was disconnected.',
  event_unused: 'Nothing in this event is used.',
  provider_unreachable: 'The provider could not be reached.',
  provider_rate_limited: 'The provider was limiting requests.',
  token_invalid: "The provider refused the connection's token.",
  payload_truncated: 'The delivery was too large to keep whole, and without a token it cannot be fetched again.',
  internal: 'Something went wrong on our side.',
};

export const eventReason = (code: string | null) => (code ? (EVENT_REASON[code] ?? code) : null);

export const RUN_RESULT: Record<AutomationRunResult, { label: string; hue: Hue }> = {
  applied: { label: 'Applied', hue: 'green' },
  skipped: { label: 'Skipped', hue: 'gray' },
  failed: { label: 'Failed', hue: 'red' },
};

export const SKIP_REASON: Record<AutomationSkipReason, string> = {
  already_in_status: 'already in that status',
  condition_not_met: 'a condition did not hold',
  archived_project: 'the project is archived',
  status_missing: 'its status no longer exists',
};

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  backlog: 'Backlog',
  unstarted: 'Not started',
  started: 'Started',
  done: 'Done',
  cancelled: 'Cancelled',
};

const PROVIDER_FALLBACK: Record<GitProviderKind, { label: string; pr: string; prs: string }> = {
  github: { label: 'GitHub', pr: 'pull request', prs: 'pull requests' },
  gitlab: { label: 'GitLab', pr: 'merge request', prs: 'merge requests' },
};

export const providerLabel = (kind: GitProviderKind) => PROVIDER_FALLBACK[kind].label;

/** The provider's own word: a GitLab card says merge request. */
export const prWord = (kind: GitProviderKind, plural = false) =>
  plural ? PROVIDER_FALLBACK[kind].prs : PROVIDER_FALLBACK[kind].pr;

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How long a check ran: `48s`, `3m 12s`, `1h 4m`. */
export function elapsed(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** `ACME-12 Login redirect loses the path` → `acme-12-login-redirect-loses-the-path`, capped for a branch name. */
export function branchNameFor(key: string, slug: string): string {
  const tail = slug.split('-').slice(0, 6).join('-');
  return tail ? `${key.toLowerCase()}-${tail}` : key.toLowerCase();
}
