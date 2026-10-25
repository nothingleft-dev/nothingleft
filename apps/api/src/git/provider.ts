import type { GitAuthKind, GitProviderKind } from '@nothingleft/types';
import type { NormalizedCommit, NormalizedEvent, NormalizedPullRequest, ProviderRepo, RepoRef } from '@git/events';
import type { GitFetch } from '@git/http';

/** What a provider needs to call its API for one connection; the token is already unsealed. */
export interface ConnectionAuth {
  base_url: string;
  auth_kind: GitAuthKind;
  installation_id: string | null;
  token: string | null;
}

export interface VerifiedDelivery {
  delivery_id: string;
  event_name: string;
}

/** Where a delivery belongs, read before anything else of it is trusted beyond the signature. */
export interface DeliveryRoute {
  installation_id: string | null;
  provider_repo_id: string | null;
}

export interface ConnectionDescription {
  account: { login: string; avatar_url: string | null; url: string };
  token_expires_at: Date | null;
  /** Whether the token may add webhooks; null when the provider does not say (or registers none). */
  can_manage_webhooks?: boolean | null;
}

export interface WebhookTarget {
  url: string;
  secret: string;
}

/** Lower-cased header names, as Fastify hands them over. */
export type DeliveryHeaders = Record<string, string | string[] | undefined>;

export interface ProviderCapabilities {
  checks: boolean;
  reviews: boolean;
  /** `compare` exists: force-pushed commits can be found and superseded. */
  compare: boolean;
  /** We register (and remove) the repository's webhook through the API. */
  webhook_registration: boolean;
  /** A push says whether it was forced; without it, every push to a stored branch is compared. */
  reports_forced_push: boolean;
}

export const PULL_REQUEST_COMMITS_MAX = 250;
export const BRANCHES_MAX = 1_000;
export const REPOSITORIES_MAX = 5_000;

export interface GitProvider {
  readonly kind: GitProviderKind;
  readonly defaultBaseUrl: string;
  readonly supports: ProviderCapabilities;

  /** Null when the signature or a required header is missing or wrong. Constant-time comparison. */
  verifyWebhook(headers: DeliveryHeaders, rawBody: Buffer, secret: string): VerifiedDelivery | null;
  route(eventName: string, payload: unknown): DeliveryRoute;
  /** Events nothing uses (tags, wiki, stars, comments) normalize to `[]`. */
  normalize(eventName: string, payload: unknown): NormalizedEvent[];
  /** A pull request's web URL on this connection's host, as the repository's full name and its number. */
  pullRequestFromUrl(url: URL): { full_name: string; number: number } | null;
  /** The repository a delivery is about, as complete as the payload describes it: how manual mode learns its repositories. */
  repositoryFromPayload(eventName: string, payload: unknown): ProviderRepo | null;
  /** A payload over the stored-size cap, reduced to what the job needs; the caller marks it truncated. */
  trim(eventName: string, payload: unknown): unknown;

  describeConnection(auth: ConnectionAuth): Promise<ConnectionDescription>;
  /** `complete` is false when the listing stopped early (a cap or a page budget): what is missing is unknown, not gone. */
  listRepositories(auth: ConnectionAuth): Promise<{ repos: ProviderRepo[]; complete: boolean }>;
  /** Null when the provider no longer has it (deleted, or the connection lost access). */
  getRepository(auth: ConnectionAuth, repo: RepoRef): Promise<ProviderRepo | null>;
  getPullRequest(auth: ConnectionAuth, repo: RepoRef, number: number): Promise<NormalizedPullRequest | null>;
  /** Open ones, plus those updated since `since` in any state; newest first. */
  listPullRequests(auth: ConnectionAuth, repo: RepoRef, since: Date, limit: number): Promise<NormalizedPullRequest[]>;
  /** At most `PULL_REQUEST_COMMITS_MAX`, oldest first; `total` is the provider's own count. */
  listPullRequestCommits(
    auth: ConnectionAuth,
    repo: RepoRef,
    number: number,
  ): Promise<{ commits: NormalizedCommit[]; total: number }>;
  listBranches(auth: ConnectionAuth, repo: RepoRef, limit: number): Promise<{ name: string; head_sha: string }[]>;
  /** Shas reachable from `head` and not from `base`. Only when `supports.compare`. */
  compare(auth: ConnectionAuth, repo: RepoRef, base: string, head: string): Promise<string[]>;

  /** Only when `supports.webhook_registration`. */
  registerWebhook(auth: ConnectionAuth, repo: RepoRef, target: WebhookTarget): Promise<{ provider_webhook_id: string }>;
  updateWebhook(auth: ConnectionAuth, repo: RepoRef, providerWebhookId: string, target: WebhookTarget): Promise<void>;
  removeWebhook(auth: ConnectionAuth, repo: RepoRef, providerWebhookId: string): Promise<void>;
  webhookExists(auth: ConnectionAuth, repo: RepoRef, providerWebhookId: string): Promise<boolean>;

  /** The provider's page for resending past deliveries, when it has one we can link to. */
  redeliveryUrl(
    connection: { base_url: string; auth_kind: GitAuthKind },
    repo: RepoRef | null,
    providerWebhookId: string | null,
  ): string | null;

  /** Present on a provider connected by installing an app; `configured` says whether this server has one. */
  readonly app?: GitAppInstall;
}

export interface GitAppInstall {
  readonly configured: boolean;
  readonly baseUrl: string;
  /** The app's own webhook secret: one URL for every installation. */
  readonly webhookSecret: string | null;
  installUrl(state: string): string;
  /**
   * Proves the person who came back from the install page can administer `installationId`:
   * exchanges their authorization `code` and finds the installation among theirs. Throws
   * `GitProviderError('forbidden')` when it is not theirs.
   */
  confirmInstallation(code: string, installationId: string): Promise<void>;
}

export interface ProviderDeps {
  fetch: GitFetch;
  now: () => Date;
}
