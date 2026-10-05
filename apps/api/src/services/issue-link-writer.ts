import {
  ISSUE_LINK_NAMES,
  ISSUE_LINK_NAME_VALUES,
  type IssueLinkName,
  type IssueLinkSnapshot,
  type IssueLinkType,
  type LinkDirection,
} from '@nothingleft/types';
import type { IssueLinkEnds, IssueRow, IssuesRepository, ProjectRow, TenantContext } from '@nothingleft/db';
import { formatIssueKey, parseIssueKey } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import { checkParent, recordParentChange } from '@services/issue-hierarchy';
import { recordIssueEvent } from '@services/issue-history';
import type { TenantRepos } from '@services/transaction';

// Shared by the links routes and issue creation, so a link made either way obeys one set of rules.

export interface LinkName {
  name: IssueLinkName;
  type: IssueLinkType;
  direction: LinkDirection;
}

export interface ReadableProjects {
  byKey: ReadonlyMap<string, ProjectRow>;
  byId: ReadonlyMap<number, ProjectRow>;
}

export interface LinkWrite {
  ctx: TenantContext;
  actorId: number;
  keyOf: (row: IssueRow) => string;
  at: Date;
  /** The request field an error names: `issues` on the links route, `links` on issue creation. */
  field: string;
}

export function readableProjects(projects: ProjectRow[]): ReadableProjects {
  return {
    byKey: new Map(projects.map(p => [p.key.toUpperCase(), p])),
    byId: new Map(projects.map(p => [p.id, p])),
  };
}

export const keyer = (byId: ReadonlyMap<number, Pick<ProjectRow, 'key'>>) => (row: IssueRow) =>
  formatIssueKey(byId.get(row.project_id)!.key, row.key_number);

export function linkNamed(name: string, field = 'link'): LinkName {
  const link = ISSUE_LINK_NAMES.find(l => l.name === name.trim().toLowerCase().replace(/\s+/g, ' '));
  if (!link) throw new AppError('link.unknown', 400, { link: name }, field, [...ISSUE_LINK_NAME_VALUES]);
  return link;
}

/** The same link read from the other issue: `depends on` ↔ `is required for`; `relates to` is its own. */
export function inverseOf(link: LinkName): LinkName {
  if (link.type === 'relates') return link;
  return ISSUE_LINK_NAMES.find(l => l.type === link.type && l.direction !== link.direction)!;
}

/** Stored outward; a `relates` link once, from the lower id, so the unique key sees A–B and B–A as one. */
export function canonicalEnds(link: LinkName, self: IssueRow, other: IssueRow): IssueLinkEnds {
  if (link.type === 'relates') {
    const [from, to] = self.id < other.id ? [self, other] : [other, self];
    return { from_issue_id: from.id, to_issue_id: to.id, type: 'relates' };
  }
  return link.direction === 'outward'
    ? { from_issue_id: self.id, to_issue_id: other.id, type: link.type }
    : { from_issue_id: other.id, to_issue_id: self.id, type: link.type };
}

/** A key the caller cannot read answers exactly as one that does not exist. */
export async function findTarget(
  issues: IssuesRepository,
  ctx: TenantContext,
  projects: ReadableProjects,
  key: string,
): Promise<IssueRow | undefined> {
  const parsed = parseIssueKey(key);
  const project = parsed && projects.byKey.get(parsed.projectKey.toUpperCase());
  return project ? issues.findByNumber(ctx, project.id, parsed.number) : undefined;
}

/** Distinct live targets; `selfId` is absent when the issue is still being created. */
export async function resolveTargets(
  issues: IssuesRepository,
  ctx: TenantContext,
  projects: ReadableProjects,
  link: LinkName,
  keys: string[],
  field: string,
  selfId?: number,
): Promise<IssueRow[]> {
  const targets: IssueRow[] = [];
  for (const key of keys) {
    const row = await findTarget(issues, ctx, projects, key);
    if (!row) throw new AppError('link.target_not_found', 400, { key }, field);
    if (row.id === selfId) throw new AppError('link.self', 400, {}, field);
    if (!targets.some(t => t.id === row.id)) targets.push(row);
  }
  if (link.type === 'subtask' && link.direction === 'inward' && targets.length > 1) {
    throw new AppError('link.one_parent', 400, {}, field);
  }
  return targets;
}

/** parent_id is the hierarchy; a subtask link only ever moves it. */
export async function moveParent(repos: TenantRepos, w: LinkWrite, child: IssueRow, parent: IssueRow | null) {
  const locked = await repos.issues.lockById(w.ctx, child.id);
  if (!locked || locked.deleted_at) {
    throw new AppError('link.target_not_found', 400, { key: w.keyOf(child) }, w.field);
  }
  const previous = await checkParent(repos, { ctx: w.ctx, child: locked, parent, keyOf: w.keyOf });
  await repos.issues.update(w.ctx, locked.id, {
    parent_id: parent?.id ?? null,
    updated_by: w.actorId,
    updated_at: w.at,
  });
  await recordParentChange(
    repos,
    { ctx: w.ctx, actorId: w.actorId, changeGroupId: Bun.randomUUIDv7(), at: w.at },
    { ctx: w.ctx, child: locked, parent, previous, keyOf: w.keyOf },
  );
}

export async function recordBothSides(
  repos: TenantRepos,
  w: LinkWrite,
  kind: 'linked' | 'unlinked',
  link: LinkName,
  self: IssueRow,
  other: IssueRow,
) {
  const changeGroupId = Bun.randomUUIDv7();
  const side = (issueId: number, name: LinkName, issue: IssueRow) => {
    const value: IssueLinkSnapshot = { link: name.name, issue: w.keyOf(issue) };
    return recordIssueEvent(
      repos.issueActivity,
      { ctx: w.ctx, issueId, actorId: w.actorId, changeGroupId, at: w.at },
      kind,
      kind === 'linked' ? { new_value: value } : { old_value: value },
    );
  };
  await side(self.id, link, other);
  await side(other.id, inverseOf(link), self);
}

/** Inside the caller's transaction, with `self` locked; the first refusal throws and undoes them all. */
export async function writeLinks(
  repos: TenantRepos,
  w: LinkWrite,
  link: LinkName,
  self: IssueRow,
  targets: IssueRow[],
): Promise<void> {
  for (const other of targets) {
    const exists = (): never => {
      throw new AppError('link.exists', 409, { key: w.keyOf(self), link: link.name, target: w.keyOf(other) }, w.field);
    };
    if (link.type === 'subtask') {
      const [child, parent] = link.direction === 'outward' ? [other, self] : [self, other];
      if (child.parent_id === parent.id) exists();
      await moveParent(repos, w, child, parent);
      continue;
    }
    const ends = canonicalEnds(link, self, other);
    if (await repos.issueLinks.exists(w.ctx, ends)) exists();
    if (
      link.type === 'depends' &&
      (await repos.issueLinks.reaches(w.ctx, 'depends', ends.to_issue_id, ends.from_issue_id))
    ) {
      const [dependent, required] = [ends.to_issue_id, ends.from_issue_id].map(id => (id === self.id ? self : other));
      throw new AppError('link.cycle', 400, { key: w.keyOf(dependent!), target: w.keyOf(required!) }, w.field);
    }
    const created = await repos.issueLinks.insert(w.ctx, { ...ends, created_by: w.actorId, created_at: w.at });
    if (!created) exists();
    await recordBothSides(repos, w, 'linked', link, self, other);
  }
}
