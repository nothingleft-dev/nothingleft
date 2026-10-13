import { describe, expect, test } from 'bun:test';
import type { Analytics } from '@nothingleft/analytics';
import type { Principal } from '@nothingleft/types';
import { searchService, type SearchDeps } from '@services/search.service';

function harness(record: () => Promise<void>) {
  const reported: unknown[] = [];
  const analytics: Analytics = {
    capture: () => {},
    captureException: error => void reported.push(error),
    shutdown: async () => {},
  };
  const org = {
    ctx: { orgId: 5 },
    scope: { isOwner: true, orgRole: 'org_admin', projectRole: null, projectId: null },
    organization: { week_starts_on: 1, workday_minutes: 480, workweek_days: 5 },
  };
  const none = async () => [];
  const search = searchService({
    access: { current: async () => org, require: () => {} } as unknown as SearchDeps['access'],
    users: { findById: async () => ({ timezone: 'UTC' }) } as unknown as SearchDeps['users'],
    projects: { listReadable: none } as unknown as SearchDeps['projects'],
    issues: {} as SearchDeps['issues'],
    issueSearch: {
      search: async () => ({ rows: [], total: 0, groups: undefined }),
    } as unknown as SearchDeps['issueSearch'],
    savedViews: { findVisibleByNames: none } as unknown as SearchDeps['savedViews'],
    recentSearches: { record } as unknown as SearchDeps['recentSearches'],
    customFields: {
      listForProjects: none,
      timeRoles: none,
      listOptions: none,
      listAppliesTo: none,
    } as unknown as SearchDeps['customFields'],
    analytics,
  });
  const principal = { via: 'session', userId: 9, sessionId: 1, currentOrgId: 5 } as Principal;
  const run = async (offset = 0) =>
    search.search(principal, await search.context(principal, {}), { q: 'login', limit: 20, offset });
  return { run, reported };
}

describe('recording a recent search', () => {
  test('a failure is reported and the search still answers', async () => {
    const { run, reported } = harness(async () => {
      throw new Error('recent searches are down');
    });
    await expect(run()).resolves.toMatchObject({ total: 0 });
    expect(reported).toHaveLength(1);
  });

  test('page 2 of a search is not recorded', async () => {
    let calls = 0;
    const { run } = harness(async () => void (calls += 1));
    await run(0);
    await run(20);
    expect(calls).toBe(1);
  });
});
