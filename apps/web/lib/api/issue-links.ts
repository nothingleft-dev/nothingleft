import type { CreateIssueLinks, IssueLinkGroup } from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/issues/${encodeURIComponent(key)}/links`;

export const listIssueLinks = (key: string) => api.get<IssueLinkGroup[]>(base(key));

export const createIssueLinks = (key: string, body: CreateIssueLinks) =>
  api.post<IssueLinkGroup[]>(base(key), { body });

export const deleteIssueLink = (key: string, target: string, link: string) =>
  api.delete<IssueLinkGroup[]>(`${base(key)}/${encodeURIComponent(target)}`, { query: { link } });
