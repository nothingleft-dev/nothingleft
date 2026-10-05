import type { Session } from '@nothingleft/types';
import { api } from '@lib/api/client';

export const listSessions = () => api.get<Session[]>('/v1/me/sessions');
export const revokeSession = (id: number) => api.delete<Session>(`/v1/me/sessions/${id}`);
export const revokeOtherSessions = () => api.delete<Session[]>('/v1/me/sessions');
export const setCurrentOrganization = (slug: string) =>
  api.post<Session>('/v1/me/current-organization', { body: { slug } });
