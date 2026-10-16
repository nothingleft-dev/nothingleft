import { parseIssueKey, parseUsername, type WorkCalendar } from '@nothingleft/format';
import type { Member, Organization } from '@nothingleft/types';
import { path } from './api.ts';
import { ToolError } from './errors.ts';
import { resolveOrganization } from './organizations.ts';
import type { ToolContext } from './tool.ts';

/** `pp-12` → `PP`; an unparseable key is left for the API to refuse with its own error. */
export function projectKeyOf(issue: string): string {
  return parseIssueKey(issue.trim().toUpperCase())?.projectKey ?? issue.trim().toUpperCase().split('-')[0]!;
}

export const issueKey = (issue: string) => issue.trim().toUpperCase();

/**
 * The organisation a project belongs to, for what the API does not say in a project-shaped
 * answer: the caller's username there (`me`), its members (a display name) and its work
 * calendar (durations). Found the way the API resolves it — named, else the only one that has
 * the key, else ambiguous with the candidates.
 */
export function projectOrganization(ctx: ToolContext, projectKey: string, slug?: string): Promise<Organization> {
  return ctx.memo(`project-org:${slug ?? ''}:${projectKey.toUpperCase()}`, async () => {
    if (slug) return resolveOrganization(ctx, slug);
    const orgs = await ctx.organizations();
    if (orgs.length === 1) return orgs[0]!;
    const found = await Promise.all(
      orgs.map(o =>
        ctx.api.get(path`/v1/projects/${projectKey.toUpperCase()}`, { org: o.slug }).then(
          () => o,
          () => null,
        ),
      ),
    );
    const holders = found.filter((o): o is Organization => o !== null);
    if (holders.length === 1) return holders[0]!;
    if (holders.length === 0) {
      throw ToolError.local('project.not_found', { key: projectKey.toUpperCase() }, { field: 'project' });
    }
    throw ToolError.local('organization_ambiguous', {}, { field: 'org', valid_values: holders.map(o => o.slug) });
  });
}

export const calendarOf = (org: Organization): WorkCalendar => ({
  workdayMinutes: org.workday_minutes,
  workweekDays: org.workweek_days,
});

/**
 * `@casey` → `casey` as it is; `me` → the caller's username there; anything else is looked up
 * among the members, as a username first and then as a full name, so "Casey Kim" works and a
 * name several members share is refused with their usernames to choose from.
 */
export async function resolveUsername(ctx: ToolContext, org: Organization, input: string): Promise<string> {
  const trimmed = input.trim();
  if (trimmed.startsWith('@')) return trimmed.slice(1);
  if (trimmed.toLowerCase() === 'me') return org.membership.username;

  const members = await ctx.memo(`members:${org.slug}:${trimmed.toLowerCase()}`, async () => {
    const { data } = await ctx.api.get<Member[]>(path`/v1/organizations/${org.slug}/members`, {
      query: { q: trimmed, limit: 50 },
    });
    return data;
  });
  const wanted = trimmed.toLowerCase();
  const byUsername = members.find(m => m.username.toLowerCase() === wanted);
  if (byUsername) return byUsername.username;
  const named = members.filter(m => m.name.toLowerCase() === wanted);
  if (named.length === 1) return named[0]!.username;
  if (named.length > 1) {
    throw ToolError.local(
      'mcp.person_ambiguous',
      { name: trimmed },
      { valid_values: named.map(m => `@${m.username}`) },
    );
  }
  const username = parseUsername(trimmed);
  if (username) return username;
  throw ToolError.local(
    'mcp.person_unknown',
    { name: trimmed, org: org.name },
    members.length ? { valid_values: members.map(m => `@${m.username}`) } : {},
  );
}

export const resolveUsernames = (ctx: ToolContext, org: Organization, inputs: readonly string[]) =>
  Promise.all(inputs.map(i => resolveUsername(ctx, org, i)));

/** Only an `@username` goes to the API untouched; `me` and anything else is read in the organisation. */
export const needsOrganization = (inputs: readonly string[]) => inputs.some(i => !i.trim().startsWith('@'));

/** People named in a project-shaped call: plain usernames go as they are, `me` and names need its organisation. */
export async function usernamesIn(
  ctx: ToolContext,
  projectKey: string,
  org: string | undefined,
  inputs: readonly string[],
) {
  if (!needsOrganization(inputs)) return inputs.map(i => i.trim().slice(1));
  return resolveUsernames(ctx, await projectOrganization(ctx, projectKey, org), inputs);
}

export async function usernameIn(ctx: ToolContext, projectKey: string, org: string | undefined, input: string) {
  return (await usernamesIn(ctx, projectKey, org, [input]))[0]!;
}

/** What the resolvers above and the tool context may call on any tool's behalf, beyond the endpoints the tool itself declares. */
export const RESOLUTION_ENDPOINTS = [
  'GET /v1/me',
  'GET /v1/organizations',
  'GET /v1/projects/{key}',
  'GET /v1/organizations/{slug}/members',
] as const;
