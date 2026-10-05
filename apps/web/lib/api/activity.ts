import type { OrgActivity, OrgActivityKind } from '@nothingleft/types';
import { api, type QueryEntry } from '@lib/api/client';
import { downloadCsv } from '@lib/api/csv';

export interface ActivityFilters {
  actor?: string | undefined;
  kind?: readonly OrgActivityKind[] | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface ActivityQuery extends ActivityFilters {
  cursor?: string | undefined;
  limit?: number | undefined;
}

const path = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}/activity`;

const params = (query: ActivityQuery): Record<string, QueryEntry> => ({
  actor: query.actor,
  kind: query.kind,
  from: query.from,
  to: query.to,
  cursor: query.cursor,
  limit: query.limit,
});

export const listActivity = (slug: string, query: ActivityQuery = {}) =>
  api.get<OrgActivity[]>(path(slug), { query: params(query) });

export const downloadActivityCsv = (slug: string, filters: ActivityFilters = {}) =>
  downloadCsv(`${path(slug)}/export.csv`, params(filters), `${slug}-activity.csv`);
