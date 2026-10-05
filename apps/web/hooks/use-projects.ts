'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddProjectMember, CreateProject, UpdateProject, UpdateProjectMember } from '@nothingleft/types';
import {
  addProjectMember,
  archiveProject,
  createProject,
  getProject,
  listProjectAssignees,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  unarchiveProject,
  updateProject,
  updateProjectMember,
  type ProjectQuery,
} from '@lib/api/projects';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useProjects(query: ProjectQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.projects(query),
    refetchInterval: POLL.list,
    queryFn: () => listProjects(query).then(r => r.data),
    enabled,
  });
}

export function useProject(key: string | null) {
  return useQuery({
    queryKey: queryKeys.project(key ?? ''),
    refetchInterval: POLL.list,
    queryFn: () => getProject(key as string).then(r => r.data),
    enabled: key !== null,
  });
}

function useProjectsInvalidated<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void client.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export const useCreateProject = () =>
  useProjectsInvalidated((body: CreateProject) => createProject(body).then(r => r.data));

export const useUpdateProject = (key: string) =>
  useProjectsInvalidated((body: UpdateProject) => updateProject(key, body).then(r => r.data));

export const useArchiveProject = () =>
  useProjectsInvalidated(({ key, archived }: { key: string; archived: boolean }) =>
    (archived ? archiveProject(key) : unarchiveProject(key)).then(r => r.data),
  );

export function useProjectMembers(key: string) {
  return useQuery({
    queryKey: queryKeys.projectMembers(key),
    refetchInterval: POLL.admin,
    queryFn: () => listProjectMembers(key).then(r => r.data),
  });
}

function useProjectMemberMutation<TInput, TResult>(key: string, fn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.projectMembers(key) }),
  });
}

export const useAddProjectMember = (key: string) =>
  useProjectMemberMutation(key, (body: AddProjectMember) => addProjectMember(key, body).then(r => r.data));

export const useUpdateProjectMember = (key: string) =>
  useProjectMemberMutation(key, ({ username, body }: { username: string; body: UpdateProjectMember }) =>
    updateProjectMember(key, username, body).then(r => r.data),
  );

export const useRemoveProjectMember = (key: string) =>
  useProjectMemberMutation(key, (username: string) => removeProjectMember(key, username).then(r => r.data));

export function useProjectAssignees(key: string | null) {
  return useQuery({
    queryKey: queryKeys.projectAssignees(key ?? ''),
    queryFn: () => listProjectAssignees(key as string).then(r => r.data),
    enabled: key !== null,
    staleTime: 5 * 60_000,
  });
}

export function useProjectAssigneesMany(projectKeys: readonly string[]) {
  return useQueries({
    queries: projectKeys.map(key => ({
      queryKey: queryKeys.projectAssignees(key),
      queryFn: () => listProjectAssignees(key).then(r => r.data),
      staleTime: 5 * 60_000,
    })),
    combine: results => ({
      isPending: results.some(r => r.isPending),
      people: results.flatMap(r => r.data ?? []),
    }),
  });
}
