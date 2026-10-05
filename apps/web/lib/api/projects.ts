import type {
  AddProjectMember,
  CreateProject,
  MemberRef,
  Project,
  ProjectMember,
  UpdateProject,
  UpdateProjectMember,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/projects/${encodeURIComponent(key)}`;

export interface ProjectQuery {
  archived?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

export const listProjects = (query: ProjectQuery = {}) =>
  api.get<Project[]>('/v1/projects', {
    query: { archived: query.archived, limit: query.limit, offset: query.offset },
  });

export const getProject = (key: string) => api.get<Project>(base(key));

export const createProject = (body: CreateProject) => api.post<Project>('/v1/projects', { body });

export const updateProject = (key: string, body: UpdateProject) => api.patch<Project>(base(key), { body });

export const archiveProject = (key: string) => api.post<Project>(`${base(key)}/archive`);

export const unarchiveProject = (key: string) => api.post<Project>(`${base(key)}/unarchive`);

export const listProjectMembers = (key: string) => api.get<ProjectMember[]>(`${base(key)}/members`);

export const addProjectMember = (key: string, body: AddProjectMember) =>
  api.post<ProjectMember>(`${base(key)}/members`, { body });

export const updateProjectMember = (key: string, username: string, body: UpdateProjectMember) =>
  api.patch<ProjectMember>(`${base(key)}/members/${encodeURIComponent(username)}`, { body });

export const removeProjectMember = (key: string, username: string) =>
  api.delete<ProjectMember>(`${base(key)}/members/${encodeURIComponent(username)}`);

export const listProjectAssignees = (key: string) => api.get<MemberRef[]>(`${base(key)}/assignees`);
