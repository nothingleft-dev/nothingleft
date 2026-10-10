import type { ApplyTags, Issue, MergeTags, Tag, TagContext, UpdateTag } from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/issues/${encodeURIComponent(key)}/tags`;

export const listTags = (q: string, context?: TagContext, limit = 20) =>
  api.get<Tag[]>('/v1/tags', { query: { q: q || undefined, context, limit } });

export const listTagsInUse = (project: string) =>
  api.get<Tag[]>('/v1/tags', { query: { context: 'article', project, in_use: true, limit: 200 } });

export const applyTags = (key: string, body: ApplyTags) => api.post<Issue>(base(key), { body });

export const removeTag = (key: string, tag: string) => api.delete<Issue>(`${base(key)}/${encodeURIComponent(tag)}`);

export const listManagedTags = (q: string, offset = 0, limit = 200) =>
  api.get<Tag[]>('/v1/tags/manage', { query: { q: q || undefined, offset, limit } });

export const updateTag = (name: string, body: UpdateTag) =>
  api.patch<Tag>(`/v1/tags/${encodeURIComponent(name)}`, { body });

export const mergeTags = (body: MergeTags) => api.post<Tag>('/v1/tags/merge', { body });

export const deleteTag = (name: string) => api.delete<Tag>(`/v1/tags/${encodeURIComponent(name)}`);
