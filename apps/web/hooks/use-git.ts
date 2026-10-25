'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClaimGitIdentity,
  CreateGitConnection,
  GitConnection,
  GitIdentity,
  IssueDevelopment,
  LinkRepository,
  MemberGitIdentity,
  ProjectRepository,
  UpdateRepositoryLink,
} from '@nothingleft/types';
import {
  checkGitConnection,
  claimGitIdentity,
  confirmGitIdentity,
  createGitConnection,
  finishGitHubConnect,
  getGitEvent,
  getIssueDevelopment,
  getPullRequest,
  linkPullRequest,
  linkRepository,
  listGitConnections,
  listGitEvents,
  listGitProviders,
  listGitRepositories,
  listMemberGitIdentities,
  listMyGitIdentities,
  listProjectRepositories,
  refreshGitConnection,
  rehookGitRepository,
  removeGitConnection,
  removeMemberGitIdentity,
  removeMyGitIdentity,
  replayGitEvent,
  resyncGitRepository,
  rotateGitSecret,
  startGitHubConnect,
  unlinkDevelopment,
  unlinkRepository,
  updateRepositoryLink,
  type GitEventsFilter,
  type GitHubCallback,
  type GitRepositoriesFilter,
} from '@lib/api/git';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export const GIT_PAGE = 50;

export function useGitProviders(enabled = true) {
  return useQuery({
    queryKey: queryKeys.gitProviders(),
    queryFn: () => listGitProviders().then(r => r.data),
    staleTime: 10 * 60_000,
    enabled,
  });
}

export function useGitConnections(slug: string | null) {
  return useQuery({
    queryKey: queryKeys.gitConnections(slug ?? ''),
    queryFn: () => listGitConnections(slug!).then(r => r.data),
    refetchInterval: POLL.admin,
    enabled: slug !== null,
  });
}

export function useGitRepositories(slug: string | null, filter: GitRepositoriesFilter, enabled = true) {
  const query = { limit: GIT_PAGE, ...filter };
  return useQuery({
    queryKey: queryKeys.gitRepositories(slug ?? '', query),
    queryFn: () => listGitRepositories(slug!, query),
    refetchInterval: POLL.admin,
    placeholderData: keepPreviousData,
    enabled: enabled && slug !== null,
  });
}

export function useGitEvents(slug: string, filter: GitEventsFilter, enabled = true) {
  const query = { limit: GIT_PAGE, ...filter };
  return useQuery({
    queryKey: queryKeys.gitEvents(slug, query),
    queryFn: () => listGitEvents(slug, query),
    refetchInterval: POLL.admin,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useGitEvent(slug: string, id: number | null) {
  return useQuery({
    queryKey: queryKeys.gitEvent(slug, id ?? 0),
    queryFn: () => getGitEvent(slug, id!).then(r => r.data),
    enabled: id !== null,
  });
}

const invalidateGit = (client: ReturnType<typeof useQueryClient>, slug: string) =>
  client.invalidateQueries({ queryKey: queryKeys.git(slug) });

export function useStartGitHubConnect(slug: string) {
  return useMutation({ mutationFn: () => startGitHubConnect(slug).then(r => r.data) });
}

export function useFinishGitHubConnect() {
  return useMutation({ mutationFn: (body: GitHubCallback) => finishGitHubConnect(body).then(r => r.data) });
}

export function useCheckGitConnection(slug: string) {
  return useMutation({ mutationFn: (body: CreateGitConnection) => checkGitConnection(slug, body).then(r => r.data) });
}

// git_connected and git_enabled live on the organisation, so a connection change refreshes it too.
const invalidateOrganizations = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: queryKeys.organizations() });

export function useCreateGitConnection(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGitConnection) => createGitConnection(slug, body).then(r => r.data),
    onSettled: () => {
      void invalidateGit(client, slug);
      void invalidateOrganizations(client);
    },
  });
}

/** Removal is drawn early: the card leaves the list at once and returns on a refusal. */
export function useRemoveGitConnection(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (connection: string) => removeGitConnection(slug, connection).then(r => r.data),
    ...optimisticList<GitConnection[], string>(client, queryKeys.gitConnections(slug), (list, name) =>
      list.filter(c => c.name !== name),
    ),
    onSettled: () => {
      void invalidateOrganizations(client);
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export function useRefreshGitConnection(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (connection: string) => refreshGitConnection(slug, connection).then(r => r.data),
    onSuccess: connection =>
      client.setQueryData<GitConnection[]>(queryKeys.gitConnections(slug), list =>
        list?.map(c => (c.name === connection.name ? connection : c)),
      ),
    onSettled: () => invalidateGit(client, slug),
  });
}

export function useRotateGitSecret(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (connection: string) => rotateGitSecret(slug, connection).then(r => r.data),
    onSettled: () => invalidateGit(client, slug),
  });
}

export function useResyncGitRepository(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, connection }: { repository: string; connection: string }) =>
      resyncGitRepository(slug, repository, connection).then(r => r.data),
    onSettled: () => invalidateGit(client, slug),
  });
}

export function useRehookGitRepository(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, connection }: { repository: string; connection: string }) =>
      rehookGitRepository(slug, repository, connection).then(r => r.data),
    onSettled: () => invalidateGit(client, slug),
  });
}

export function useReplayGitEvent(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, runAutomations }: { id: number; runAutomations: boolean }) =>
      replayGitEvent(slug, id, runAutomations).then(r => r.data),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: [...queryKeys.git(slug), 'event'] });
      void client.invalidateQueries({ queryKey: [...queryKeys.git(slug), 'events'] });
    },
  });
}

export function useMemberGitIdentities(slug: string) {
  return useQuery({
    queryKey: queryKeys.memberGitIdentities(slug),
    queryFn: () => listMemberGitIdentities(slug).then(r => r.data),
    refetchInterval: POLL.admin,
  });
}

export function useRemoveMemberGitIdentity(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => removeMemberGitIdentity(slug, id).then(r => r.data),
    ...optimisticList<MemberGitIdentity[], number>(client, queryKeys.memberGitIdentities(slug), (list, id) =>
      list.filter(i => i.id !== id),
    ),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.memberGitIdentities(slug) }),
  });
}

export function useProjectRepositories(key: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.projectRepositories(key),
    queryFn: () => listProjectRepositories(key).then(r => r.data),
    refetchInterval: query =>
      query.state.data?.some(r => r.backfill?.state === 'queued' || r.backfill?.state === 'running')
        ? POLL.job(query)
        : POLL.admin(query),
    enabled,
  });
}

// A link changes what every issue of the project shows (git_enabled, badges), so issues,
// boards and the organisation's git_enabled refresh too.
function invalidateProjectGit(client: ReturnType<typeof useQueryClient>, key: string) {
  void client.invalidateQueries({ queryKey: queryKeys.projectRepositories(key) });
  void client.invalidateQueries({ queryKey: ['organizations'] });
  void client.invalidateQueries({ queryKey: ['projects'] });
  void invalidateIssueViews(client);
}

function invalidateIssueViews(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ['issues'] });
  void client.invalidateQueries({ queryKey: queryKeys.boardViews() });
  void client.invalidateQueries({ queryKey: ['backlog'] });
}

const sameRepository = (a: { full_name: string; connection: string }, repository: string, connection: string) =>
  a.full_name === repository && a.connection === connection;

export function useLinkRepository(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, body }: { repository: string; body: LinkRepository }) =>
      linkRepository(key, repository, body).then(r => r.data),
    onSuccess: repo =>
      client.setQueryData<ProjectRepository[]>(queryKeys.projectRepositories(key), list =>
        list ? [...list.filter(r => !sameRepository(r, repo.full_name, repo.connection)), repo] : [repo],
      ),
    onSettled: () => invalidateProjectGit(client, key),
  });
}

export function useUpdateRepositoryLink(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, body }: { repository: string; body: UpdateRepositoryLink }) =>
      updateRepositoryLink(key, repository, body).then(r => r.data),
    ...optimisticList<ProjectRepository[], { repository: string; body: UpdateRepositoryLink }>(
      client,
      queryKeys.projectRepositories(key),
      (list, { repository, body }) =>
        list.map(r =>
          sameRepository(r, repository, body.connection ?? r.connection)
            ? {
                ...r,
                ...(body.match_all_projects !== undefined ? { match_all_projects: body.match_all_projects } : {}),
                ...(body.merge_base_branches !== undefined
                  ? {
                      merge_base_branches: body.merge_base_branches,
                      effective_merge_base_branches: body.merge_base_branches ?? [r.default_branch],
                    }
                  : {}),
              }
            : r,
        ),
    ),
    onSettled: () => invalidateProjectGit(client, key),
  });
}

type RepositoryRef = { repository: string; connection: string };

export function useUnlinkRepository(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ repository, connection }: RepositoryRef) =>
      unlinkRepository(key, repository, connection).then(r => r.data),
    ...optimisticList<ProjectRepository[], RepositoryRef>(
      client,
      queryKeys.projectRepositories(key),
      (list, { repository, connection }) => list.filter(r => !sameRepository(r, repository, connection)),
    ),
    onSettled: () => invalidateProjectGit(client, key),
  });
}

export function useIssueDevelopment(key: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.issueDevelopment(key),
    queryFn: () => getIssueDevelopment(key).then(r => r.data),
    refetchInterval: POLL.list,
    enabled,
  });
}

function settleDevelopment(client: ReturnType<typeof useQueryClient>, key: string, development: IssueDevelopment) {
  client.setQueryData(queryKeys.issueDevelopment(key), development);
}

export function useLinkPullRequest(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => linkPullRequest(key, url).then(r => r.data),
    onSuccess: development => settleDevelopment(client, key, development),
    onSettled: () => invalidateIssueViews(client),
  });
}

export function useUnlinkDevelopment(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => unlinkDevelopment(key, linkId).then(r => r.data),
    onSuccess: development => settleDevelopment(client, key, development),
    onSettled: () => invalidateIssueViews(client),
  });
}

export function usePullRequest(repository: string, number: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.pullRequest(repository, number),
    queryFn: () => getPullRequest(repository, number).then(r => r.data),
    enabled,
  });
}

export function useMyGitIdentities(enabled = true) {
  return useQuery({
    queryKey: queryKeys.myGitIdentities(),
    queryFn: () => listMyGitIdentities().then(r => r.data),
    enabled,
  });
}

export function useClaimGitIdentity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ClaimGitIdentity) => claimGitIdentity(body).then(r => r.data),
    onSuccess: list => client.setQueryData(queryKeys.myGitIdentities(), list),
    // A login counts at once: authors it matches now show as the member.
    onSettled: () => client.invalidateQueries({ queryKey: ['issues'] }),
  });
}

export function useRemoveMyGitIdentity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => removeMyGitIdentity(id).then(r => r.data),
    ...optimisticList<GitIdentity[], number>(client, queryKeys.myGitIdentities(), (list, id) =>
      list.filter(i => i.id !== id),
    ),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.myGitIdentities() }),
  });
}

export function useConfirmGitIdentity() {
  return useMutation({ mutationFn: (token: string) => confirmGitIdentity(token).then(r => r.data) });
}

/** The organisation's repository list links into any project, so the project is a variable here. */
export function useLinkRepositoryTo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ project, repository, connection }: { project: string; repository: string; connection: string }) =>
      linkRepository(project, repository, { connection, backfill: true }).then(r => r.data),
    onSettled: (_data, _error, { project }) => invalidateProjectGit(client, project),
  });
}
