import type {
  ClaimGitIdentity,
  CreateGitConnection,
  GitConnection,
  GitConnectionCheck,
  GitConnectionSecret,
  GitEventStatus,
  GitIdentity,
  GitProviderInfo,
  GitPullRequestDetail,
  GitRepository,
  GitWebhookEvent,
  GitWebhookEventDetail,
  IssueDevelopment,
  LinkRepository,
  MemberGitIdentity,
  ProjectRepository,
  UpdateRepositoryLink,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const git = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}/git`;
// Repositories and connections travel as one percent-encoded segment: `acme%2Fweb`, `github%3Aacme-inc`.
const segment = encodeURIComponent;

export const listGitProviders = () => api.get<GitProviderInfo[]>('/v1/git/providers');

export const startGitHubConnect = (slug: string) =>
  api.post<{ install_url: string }>(`${git(slug)}/connect/github/start`);

export interface GitHubCallback {
  state: string;
  code: string;
  installation_id: string;
  setup_action?: string;
}

export const finishGitHubConnect = (body: GitHubCallback) =>
  api.post<GitConnection>('/v1/git/connect/github/callback', { body });

export const listGitConnections = (slug: string) => api.get<GitConnection[]>(`${git(slug)}/connections`);

export const checkGitConnection = (slug: string, body: CreateGitConnection) =>
  api.post<GitConnectionCheck>(`${git(slug)}/connections`, { body: { ...body, dry_run: true }, timeoutMs: 30_000 });

export const createGitConnection = (slug: string, body: CreateGitConnection) =>
  api.post<GitConnectionSecret>(`${git(slug)}/connections`, { body, timeoutMs: 30_000 });

export const removeGitConnection = (slug: string, connection: string) =>
  api.delete<GitConnection>(`${git(slug)}/connections/${segment(connection)}`);

export const refreshGitConnection = (slug: string, connection: string) =>
  api.post<GitConnection>(`${git(slug)}/connections/${segment(connection)}/refresh`, { timeoutMs: 30_000 });

export const rotateGitSecret = (slug: string, connection: string) =>
  api.post<GitConnectionSecret>(`${git(slug)}/connections/${segment(connection)}/rotate-secret`);

export interface GitRepositoriesFilter {
  connection?: string;
  q?: string;
  linked?: 'true' | 'false';
  project?: string;
  limit?: number;
  offset?: number;
}

export const listGitRepositories = (slug: string, query: GitRepositoriesFilter) =>
  api.get<GitRepository[]>(`${git(slug)}/repositories`, { query: { ...query } });

// `connection` names which one when two connections hold a repository of that name.
export const resyncGitRepository = (slug: string, repository: string, connection: string) =>
  api.post<GitRepository>(`${git(slug)}/repositories/${segment(repository)}/resync`, {
    query: { connection },
    timeoutMs: 30_000,
  });

export const rehookGitRepository = (slug: string, repository: string, connection: string) =>
  api.post<GitRepository>(`${git(slug)}/repositories/${segment(repository)}/rehook`, {
    query: { connection },
    timeoutMs: 30_000,
  });

export interface GitEventsFilter {
  connection?: string;
  repository?: string;
  status?: GitEventStatus;
  limit?: number;
  offset?: number;
}

export const listGitEvents = (slug: string, query: GitEventsFilter) =>
  api.get<GitWebhookEvent[]>(`${git(slug)}/events`, { query: { ...query } });

export const getGitEvent = (slug: string, id: number) => api.get<GitWebhookEventDetail>(`${git(slug)}/events/${id}`);

export const replayGitEvent = (slug: string, id: number, runAutomations: boolean) =>
  api.post<GitWebhookEventDetail>(`${git(slug)}/events/${id}/replay`, { body: { run_automations: runAutomations } });

export const listMemberGitIdentities = (slug: string) => api.get<MemberGitIdentity[]>(`${git(slug)}/identities`);

export const removeMemberGitIdentity = (slug: string, id: number) =>
  api.delete<MemberGitIdentity[]>(`${git(slug)}/identities/${id}`);

const projectRepos = (key: string) => `/v1/projects/${encodeURIComponent(key)}/repositories`;

export const listProjectRepositories = (key: string) => api.get<ProjectRepository[]>(projectRepos(key));

export const linkRepository = (key: string, repository: string, body: LinkRepository) =>
  api.put<ProjectRepository>(`${projectRepos(key)}/${segment(repository)}`, { body });

export const updateRepositoryLink = (key: string, repository: string, body: UpdateRepositoryLink) =>
  api.patch<ProjectRepository>(`${projectRepos(key)}/${segment(repository)}`, { body });

export const unlinkRepository = (key: string, repository: string, connection: string) =>
  api.delete<ProjectRepository[]>(`${projectRepos(key)}/${segment(repository)}`, { query: { connection } });

const development = (key: string) => `/v1/issues/${encodeURIComponent(key)}/development`;

export const getIssueDevelopment = (key: string) => api.get<IssueDevelopment>(development(key));

export const linkPullRequest = (key: string, url: string) =>
  api.post<IssueDevelopment>(`${development(key)}/links`, { body: { url }, timeoutMs: 30_000 });

export const unlinkDevelopment = (key: string, linkId: number) =>
  api.delete<IssueDevelopment>(`${development(key)}/links/${linkId}`);

export const getPullRequest = (repository: string, number: number) =>
  api.get<GitPullRequestDetail>(`/v1/git/pull-requests/${segment(repository)}/${number}`);

export const listMyGitIdentities = () => api.get<GitIdentity[]>('/v1/me/git-identities');

export const claimGitIdentity = (body: ClaimGitIdentity) => api.post<GitIdentity[]>('/v1/me/git-identities', { body });

export const removeMyGitIdentity = (id: number) => api.delete<GitIdentity[]>(`/v1/me/git-identities/${id}`);

export const confirmGitIdentity = (token: string) =>
  api.post<GitIdentity>('/v1/git/identities/confirm', { body: { token } });
