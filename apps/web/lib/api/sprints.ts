import type {
  BacklogMove,
  CreateSprint,
  FinishSprint,
  Issue,
  Sprint,
  SprintFinishResult,
  SprintState,
  StartSprint,
  UpdateSprint,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const project = (key: string) => `/v1/projects/${encodeURIComponent(key)}`;
const sprint = (key: string, name: string) => `${project(key)}/sprints/${encodeURIComponent(name)}`;
const states = (list?: readonly SprintState[]) => (list?.length ? list.join(',') : undefined);

export const listSprintsAcross = (state?: readonly SprintState[]) =>
  api.get<Sprint[]>('/v1/sprints', { query: { state: states(state) } });

export const listSprints = (key: string, state?: readonly SprintState[]) =>
  api.get<Sprint[]>(`${project(key)}/sprints`, { query: { state: states(state) } });

export const getSprint = (key: string, name: string) => api.get<Sprint>(sprint(key, name));

export const createSprint = (key: string, body: CreateSprint) => api.post<Sprint>(`${project(key)}/sprints`, { body });

export const updateSprint = (key: string, name: string, body: UpdateSprint) =>
  api.patch<Sprint>(sprint(key, name), { body });

export const deleteSprint = (key: string, name: string) => api.delete<Sprint>(sprint(key, name));

export const startSprint = (key: string, name: string, body: StartSprint) =>
  api.post<Sprint>(`${sprint(key, name)}/start`, { body });

export const finishSprint = (key: string, name: string, body: FinishSprint) =>
  api.post<SprintFinishResult>(`${sprint(key, name)}/finish`, { body });

export interface BacklogQuery {
  /** A sprint's slug; absent is the backlog. */
  sprint?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export const listBacklog = (key: string, query: BacklogQuery) =>
  api.get<Issue[]>(`${project(key)}/backlog`, {
    query: { sprint: query.sprint, q: query.q || undefined, limit: query.limit, offset: query.offset },
  });

export const moveInBacklog = (key: string, body: BacklogMove) =>
  api.post<Issue[]>(`${project(key)}/backlog/move`, { body });
