// The only shapes the rest of the API handles: no provider payload shape passes `normalize`.
// Every string here came from the provider and is untrusted text.

export const TEXT_CAPS = {
  name: 255,
  ref: 255,
  title: 1_000,
  // Bodies and messages are scanned for references; only a commit's first 4 KB is stored.
  body: 65_536,
  message: 65_536,
  url: 2_048,
} as const;

export function cap(value: string | null | undefined, limit: number): string {
  if (!value) return '';
  return value.length > limit ? value.slice(0, limit) : value;
}

export function capOrNull(value: string | null | undefined, limit: number): string | null {
  return value ? cap(value, limit) : null;
}

export interface EventActor {
  login: string | null;
  provider_user_id: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface RepoRef {
  provider_repo_id: string;
  full_name: string;
}

export interface ProviderRepo extends RepoRef {
  html_url: string;
  default_branch: string;
  is_private: boolean;
  is_archived: boolean;
}

export interface NormalizedCommit {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  author_login: string | null;
  author_provider_id: string | null;
  committed_at: string;
  url: string;
  /** False for a commit the push carries only because it already exists on another branch. */
  distinct: boolean;
}

export type PullRequestState = 'draft' | 'open' | 'merged' | 'closed';

export interface NormalizedPullRequest {
  number: number;
  title: string;
  body: string;
  state: PullRequestState;
  draft: boolean;
  author: EventActor;
  head: { repo_full_name: string | null; ref: string; sha: string };
  base: { ref: string };
  merge_commit_sha: string | null;
  merged_by: EventActor | null;
  html_url: string;
  requested_reviewers: EventActor[];
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  commits_count: number | null;
  provider_updated_at: string;
  opened_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export const PULL_REQUEST_ACTIONS = [
  'opened',
  'edited',
  'ready_for_review',
  'converted_to_draft',
  'synchronized',
  'reopened',
  'closed',
  'retargeted',
] as const;
export type PullRequestAction = (typeof PULL_REQUEST_ACTIONS)[number];

export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'dismissed';
export type CheckStatus = 'queued' | 'in_progress' | 'completed';
export type CheckConclusion =
  'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'stale';

export interface NormalizedCheck {
  /** Stable per provider check: a GitHub check run id, `status:<context>`, `job:<id>`, `pipeline:<id>`. */
  external_id: string;
  name: string;
  status: CheckStatus;
  conclusion: CheckConclusion | null;
  details_url: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export const REPOSITORY_EVENTS = [
  'repository.renamed',
  'repository.transferred',
  'repository.archived',
  'repository.unarchived',
  'repository.deleted',
  'repository.removed_from_installation',
  'repository.added_to_installation',
] as const;
export type RepositoryEventType = (typeof REPOSITORY_EVENTS)[number];

export type NormalizedEvent =
  | {
      type: 'branch.created' | 'branch.deleted';
      repo: RepoRef;
      ref: string;
      head_sha: string | null;
      actor: EventActor;
    }
  | {
      type: 'push';
      repo: RepoRef;
      /** The branch name, without `refs/heads/`. Tag pushes never normalize. */
      ref: string;
      before: string;
      after: string;
      forced: boolean;
      created: boolean;
      deleted: boolean;
      /** Distinct commits first, at most 100; `commits_truncated` when the push carried more. */
      commits: NormalizedCommit[];
      commits_truncated: boolean;
      pusher: EventActor;
    }
  | {
      type: `pull_request.${PullRequestAction}`;
      repo: RepoRef;
      pull_request: NormalizedPullRequest;
      actor: EventActor;
    }
  | {
      type: 'pull_request.review';
      repo: RepoRef;
      number: number;
      reviewer: EventActor;
      state: ReviewState;
      submitted_at: string;
    }
  | { type: 'check.updated'; repo: RepoRef; sha: string; check: NormalizedCheck }
  | { type: RepositoryEventType; repo: ProviderRepo; previous_full_name: string | null }
  | { type: 'connection.suspended' | 'connection.unsuspended' | 'connection.uninstalled' };

export type NormalizedEventType = NormalizedEvent['type'];
