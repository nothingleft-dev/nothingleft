import type { Member, RemovalPreview, RemoveMember, UpdateMember } from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}/members`;

export interface MemberQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

export const listMembers = (slug: string, query: MemberQuery = {}) =>
  api.get<Member[]>(base(slug), { query: { q: query.q, limit: query.limit, offset: query.offset } });

export const getMember = (slug: string, username: string) =>
  api.get<Member>(`${base(slug)}/${encodeURIComponent(username)}`);

export const updateMember = (slug: string, username: string, body: UpdateMember) =>
  api.patch<Member>(`${base(slug)}/${encodeURIComponent(username)}`, { body });

export const getRemovalPreview = (slug: string, username: string) =>
  api.get<RemovalPreview>(`${base(slug)}/${encodeURIComponent(username)}/removal`);

export const removeMember = (slug: string, username: string, choices: RemoveMember) =>
  api.delete<Member>(`${base(slug)}/${encodeURIComponent(username)}`, { query: { ...choices } });
