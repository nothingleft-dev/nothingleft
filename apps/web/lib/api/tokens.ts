import type { CreatePersonalAccessToken, CreatedPersonalAccessToken, PersonalAccessToken } from '@nothingleft/types';
import { api } from '@lib/api/client';

export const listTokens = () => api.get<PersonalAccessToken[]>('/v1/me/tokens');
export const createToken = (body: CreatePersonalAccessToken) =>
  api.post<CreatedPersonalAccessToken>('/v1/me/tokens', { body });
export const revokeToken = (id: number) => api.delete<PersonalAccessToken>(`/v1/me/tokens/${id}`);
