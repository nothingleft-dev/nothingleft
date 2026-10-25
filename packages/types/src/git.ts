import { z } from 'zod';
import {
  GIT_AUTH_KINDS,
  GIT_BACKFILL_STATES,
  GIT_CHECK_CONCLUSIONS,
  GIT_CHECK_STATUSES,
  GIT_CI_STATES,
  GIT_DEVELOPMENT_ROLLUPS,
  GIT_LINK_INTENTS,
  GIT_LINK_SOURCES,
  GIT_PULL_REQUEST_STATES,
  GIT_REVIEW_STATES,
  GIT_REVIEWER_STATES,
  GIT_CONNECT_KINDS,
  GIT_CONNECTION_ERRORS,
  GIT_CONNECTION_HEALTH,
  GIT_CONNECTION_STATUSES,
  GIT_EVENT_STATUSES,
  GIT_MERGE_BASE_BRANCHES_MAX,
  GIT_PAGE_DEFAULT,
  GIT_PAGE_MAX,
  GIT_WEBHOOK_STATUSES,
} from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

// A new provider is one module in the API's registry plus one entry here.
export const GIT_PROVIDER_KINDS = ['github', 'gitlab'] as const;
export const GitProviderKindSchema = z.enum(GIT_PROVIDER_KINDS);
export type GitProviderKind = z.infer<typeof GitProviderKindSchema>;

export const GitProviderInfoSchema = z.object({
  kind: GitProviderKindSchema,
  label: z.string(),
  pull_request_word: z.string(),
  pull_request_word_plural: z.string(),
  // The way the connect card offers first; `connect_kinds` lists every way this server allows.
  connect_kind: z.enum(GIT_CONNECT_KINDS),
  connect_kinds: z.array(z.enum(GIT_CONNECT_KINDS)),
  default_base_url: z.string(),
  supports: z.object({
    checks: z.boolean(),
    reviews: z.boolean(),
    compare: z.boolean(),
    webhook_registration: z.boolean(),
  }),
});
export type GitProviderInfo = z.infer<typeof GitProviderInfoSchema>;

export const GitAccountSchema = z.object({
  login: z.string(),
  avatar_url: z.string().nullable(),
  url: z.string(),
});
export type GitAccount = z.infer<typeof GitAccountSchema>;

export const GitConnectionSchema = z.object({
  // `github:acme-inc`, or `gitlab:acme@gitlab.example.com` away from the provider's own host.
  name: z.string(),
  provider: GitProviderKindSchema,
  base_url: z.string(),
  auth_kind: z.enum(GIT_AUTH_KINDS),
  account: GitAccountSchema,
  status: z.enum(GIT_CONNECTION_STATUSES),
  health: z.enum(GIT_CONNECTION_HEALTH),
  last_error: z.enum(GIT_CONNECTION_ERRORS).nullable(),
  last_event_at: z.string().nullable(),
  token_expires_at: z.string().nullable(),
  // Manual mode may run without a token: inherited links and backfill are then off.
  has_token: z.boolean(),
  // Where the provider delivers; null for an app installation, whose URL is the server's own.
  webhook_url: z.string().nullable(),
  redelivery_url: z.string().nullable(),
  repositories: z.object({
    known: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    webhooks_missing: z.number().int().nonnegative(),
  }),
  created_by: MemberRefSchema.nullable(),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
});
export type GitConnection = z.infer<typeof GitConnectionSchema>;

// The one response that carries the shared secret: shown once, at creation or rotation.
export const GitConnectionSecretSchema = GitConnectionSchema.extend({
  webhook_secret: z.string().nullable(),
});
export type GitConnectionSecret = z.infer<typeof GitConnectionSecretSchema>;

export const GitConnectionCheckSchema = z.object({
  provider: GitProviderKindSchema,
  base_url: z.string(),
  account: GitAccountSchema,
  repository_count: z.number().int().nonnegative(),
  token_expires_at: z.string().nullable(),
});
export type GitConnectionCheck = z.infer<typeof GitConnectionCheckSchema>;

const BaseUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(255)
  .transform(u => u.replace(/\/+$/, ''));

export const CreateGitConnectionSchema = z.object({
  provider: GitProviderKindSchema,
  // `token`: GitLab's group or project access token. `manual`: a webhook the admin adds by hand, with an optional token.
  mode: z.enum(['token', 'manual']),
  base_url: BaseUrlSchema.optional(),
  token: z.string().trim().min(1).max(512).optional(),
  // Manual mode without a token: the account the webhooks come from, which names the connection.
  account: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
    .optional(),
  // The connect sheet's Check: describes the account behind the token and saves nothing.
  dry_run: z.boolean().optional(),
});
export type CreateGitConnection = z.infer<typeof CreateGitConnectionSchema>;

export const GitBackfillSchema = z.object({
  state: z.enum(GIT_BACKFILL_STATES),
  pull_requests: z.number().int().nonnegative(),
  branches: z.number().int().nonnegative(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
});
export type GitBackfill = z.infer<typeof GitBackfillSchema>;

export const GitRepositorySchema = z.object({
  full_name: z.string(),
  provider: GitProviderKindSchema,
  connection: z.string(),
  html_url: z.string(),
  default_branch: z.string(),
  is_private: z.boolean(),
  is_archived: z.boolean(),
  // Removed from the installation or deleted at the provider: shown greyed, never relinkable until it returns.
  removed: z.boolean(),
  webhook_status: z.enum(GIT_WEBHOOK_STATUSES),
  webhook_last_status_code: z.number().int().nullable(),
  match_all_projects: z.boolean(),
  // null follows the repository's own default branch.
  merge_base_branches: z.array(z.string()).nullable(),
  effective_merge_base_branches: z.array(z.string()),
  last_event_at: z.string().nullable(),
  // Keys of the linked projects the caller can read.
  projects: z.array(z.string()),
  backfill: GitBackfillSchema.nullable(),
});
export type GitRepository = z.infer<typeof GitRepositorySchema>;

export const ProjectRepositorySchema = GitRepositorySchema.extend({
  linked_by: MemberRefSchema.nullable(),
  linked_at: z.string(),
});
export type ProjectRepository = z.infer<typeof ProjectRepositorySchema>;

const BranchPatternSchema = z.string().trim().min(1).max(255);

const ConnectionRefSchema = z.string().trim().min(1).max(300);

export const LinkRepositorySchema = z.object({
  // Which connection's repository, when two have one of that name.
  connection: ConnectionRefSchema.optional(),
  match_all_projects: z.boolean().optional(),
  merge_base_branches: z.array(BranchPatternSchema).max(GIT_MERGE_BASE_BRANCHES_MAX).nullable().optional(),
  // Open pull requests and those merged or closed in the last 90 days, with matching branches.
  backfill: z.boolean().default(true),
});
export type LinkRepository = z.infer<typeof LinkRepositorySchema>;

export const UpdateRepositoryLinkSchema = z.object({
  connection: ConnectionRefSchema.optional(),
  match_all_projects: z.boolean().optional(),
  merge_base_branches: z.array(BranchPatternSchema).max(GIT_MERGE_BASE_BRANCHES_MAX).nullable().optional(),
});
export type UpdateRepositoryLink = z.infer<typeof UpdateRepositoryLinkSchema>;

const PageSchema = {
  limit: z.coerce.number().int().min(1).max(GIT_PAGE_MAX).default(GIT_PAGE_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
};

export const GitRepositoriesQuerySchema = z.object({
  connection: z.string().trim().min(1).max(300).optional(),
  q: z.string().trim().max(200).optional(),
  linked: z.enum(['true', 'false']).optional(),
  // Required for a Project Admin who is not an Org Admin: the project the picker links into.
  project: z.string().trim().min(1).max(20).optional(),
  ...PageSchema,
});
export type GitRepositoriesQuery = z.infer<typeof GitRepositoriesQuerySchema>;

export const GitWebhookEventSchema = z.object({
  id: z.number().int(),
  connection: z.string(),
  repository: z.string().nullable(),
  delivery_id: z.string(),
  event: z.string(),
  status: z.enum(GIT_EVENT_STATUSES),
  // An `ignored` reason or a `failed` error, as a catalogue code.
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  received_at: z.string(),
  processed_at: z.string().nullable(),
  truncated: z.boolean(),
  run_automations: z.boolean(),
});
export type GitWebhookEvent = z.infer<typeof GitWebhookEventSchema>;

// The stored payload is the provider's text, untrusted: render it as data, never as markup.
export const GitWebhookEventDetailSchema = GitWebhookEventSchema.extend({
  payload: z.unknown(),
});
export type GitWebhookEventDetail = z.infer<typeof GitWebhookEventDetailSchema>;

export const GitEventsQuerySchema = z.object({
  connection: z.string().trim().min(1).max(300).optional(),
  status: z.enum(GIT_EVENT_STATUSES).optional(),
  repository: z.string().trim().min(1).max(300).optional(),
  ...PageSchema,
});
export type GitEventsQuery = z.infer<typeof GitEventsQuerySchema>;

export const RepositoryRefQuerySchema = z.object({ connection: ConnectionRefSchema.optional() });
export type RepositoryRefQuery = z.infer<typeof RepositoryRefQuerySchema>;

export const ReplayGitEventSchema = z.object({
  // Replays are history by default; a Project Admin of every affected project may ask for automations.
  run_automations: z.boolean().default(false),
});
export type ReplayGitEvent = z.infer<typeof ReplayGitEventSchema>;

export const GitWebhookAcceptedSchema = z.object({ accepted: z.boolean() });
export type GitWebhookAccepted = z.infer<typeof GitWebhookAcceptedSchema>;

// Development: what an issue's branches, commits and pull requests show (plan § 4.10, § 7).

export const GitDevelopmentSummarySchema = z.object({
  rollup: z.enum(GIT_DEVELOPMENT_ROLLUPS),
  pull_requests: z.number().int().nonnegative(),
  commits: z.number().int().nonnegative(),
  branches: z.number().int().nonnegative(),
  repositories: z.number().int().nonnegative(),
});
export type GitDevelopmentSummary = z.infer<typeof GitDevelopmentSummarySchema>;

// Who wrote it: the member when the provider identity maps to one, else the provider's own login.
export const GitAuthorSchema = z.object({
  member: MemberRefSchema.nullable(),
  login: z.string().nullable(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});
export type GitAuthor = z.infer<typeof GitAuthorSchema>;

export const GitRepositoryRefSchema = z.object({
  full_name: z.string(),
  provider: GitProviderKindSchema,
  html_url: z.string(),
});
export type GitRepositoryRef = z.infer<typeof GitRepositoryRefSchema>;

export const GitLinkInfoSchema = z.object({
  // The number the panel's Unlink acts on.
  link_id: z.number().int(),
  sources: z.array(z.enum(GIT_LINK_SOURCES)),
  intent: z.enum(GIT_LINK_INTENTS),
  linked_at: z.string(),
});
export type GitLinkInfo = z.infer<typeof GitLinkInfoSchema>;

export const GitCheckSchema = z.object({
  name: z.string(),
  status: z.enum(GIT_CHECK_STATUSES),
  conclusion: z.enum(GIT_CHECK_CONCLUSIONS).nullable(),
  details_url: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
export type GitCheck = z.infer<typeof GitCheckSchema>;

export const GitCommitSchema = z.object({
  sha: z.string(),
  short_sha: z.string(),
  subject: z.string(),
  author: GitAuthorSchema,
  committed_at: z.string(),
  html_url: z.string().nullable(),
  superseded: z.boolean(),
  // Set when the commit itself is linked to the issue; null when it shows only as part of a pull request.
  link: GitLinkInfoSchema.nullable(),
});
export type GitCommit = z.infer<typeof GitCommitSchema>;

export const GitBranchSchema = z.object({
  name: z.string(),
  head_sha: z.string().nullable(),
  deleted: z.boolean(),
  link: GitLinkInfoSchema.nullable(),
});
export type GitBranch = z.infer<typeof GitBranchSchema>;

export const GitReviewerSchema = z.object({
  author: GitAuthorSchema,
  state: z.enum(GIT_REVIEWER_STATES),
});
export type GitReviewer = z.infer<typeof GitReviewerSchema>;

export const GitPullRequestSchema = z.object({
  // `acme/web#42`; GitLab's are `acme/web!42` in its own UI, but one form here.
  ref: z.string(),
  repository: GitRepositoryRefSchema,
  number: z.number().int(),
  title: z.string(),
  state: z.enum(GIT_PULL_REQUEST_STATES),
  author: GitAuthorSchema,
  head_ref: z.string(),
  // `owner:branch` for a pull request from a fork.
  head_label: z.string(),
  base_ref: z.string(),
  html_url: z.string().nullable(),
  review_state: z.enum(GIT_REVIEW_STATES),
  reviewers: z.array(GitReviewerSchema),
  ci_state: z.enum(GIT_CI_STATES),
  ci_summary: z.record(z.string(), z.number().int()),
  additions: z.number().int().nullable(),
  deletions: z.number().int().nullable(),
  changed_files: z.number().int().nullable(),
  is_revert: z.boolean(),
  // A linked revert merged after this one did.
  reverted: z.boolean(),
  merged_by: GitAuthorSchema.nullable(),
  opened_at: z.string(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  updated_at: z.string(),
  // How many of its commits were read, of how many; a pull request over 250 commits is read in part.
  commits_scanned: z.number().int().nonnegative(),
  commits_total: z.number().int().nullable(),
  commits: z.array(GitCommitSchema),
  link: GitLinkInfoSchema.nullable(),
});
export type GitPullRequest = z.infer<typeof GitPullRequestSchema>;

export const GitPullRequestDetailSchema = GitPullRequestSchema.extend({
  checks: z.array(GitCheckSchema),
  // Keys of the issues it is linked to that the caller can read.
  issues: z.array(z.string()),
});
export type GitPullRequestDetail = z.infer<typeof GitPullRequestDetailSchema>;

export const IssueDevelopmentSchema = z.object({
  summary: GitDevelopmentSummarySchema,
  // False when the issue's project has no linked repository: the panel explains how to link one.
  git_enabled: z.boolean(),
  repositories: z.array(
    z.object({
      repository: GitRepositoryRefSchema,
      pull_requests: z.array(GitPullRequestSchema),
      // Branches with no open pull request of their own.
      branches: z.array(GitBranchSchema),
      // Commits linked to the issue that belong to none of the pull requests shown.
      commits: z.array(GitCommitSchema),
    }),
  ),
});
export type IssueDevelopment = z.infer<typeof IssueDevelopmentSchema>;

export const LinkPullRequestSchema = z.object({
  url: z.url().max(2_048),
});
export type LinkPullRequest = z.infer<typeof LinkPullRequestSchema>;
