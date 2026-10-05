import {
  ISSUE_LINK_NAMES,
  type CreateIssueLinks,
  type IssueLinkGroup,
  type IssueLinkName,
  type Principal,
} from '@nothingleft/types';
import type { IssueLinksRepository, IssueRow, IssuesRepository } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import {
  canonicalEnds,
  findTarget,
  keyer,
  linkNamed,
  moveParent,
  readableProjects,
  recordBothSides,
  resolveTargets,
  writeLinks,
  type LinkName,
  type LinkWrite,
} from '@services/issue-link-writer';
import type { IssuesService, Located } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

export interface IssueLinksDeps {
  issues: IssuesService;
  issuesRepo: IssuesRepository;
  issueLinks: IssueLinksRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

// The order the issue page shows its tabs in: hierarchy first, then dependencies.
const DISPLAY_ORDER: IssueLinkName[] = [
  'parent for',
  'subtask of',
  'depends on',
  'is required for',
  'duplicates',
  'is duplicated by',
  'relates to',
];

export function issueLinksService(deps: IssueLinksDeps) {
  const { issues, issuesRepo, issueLinks, inTransaction, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  const readable = async (principal: Principal, located: Located) =>
    readableProjects(await issues.readableProjects(principal, located.project));

  async function groups(principal: Principal, located: Located): Promise<IssueLinkGroup[]> {
    const { ctx } = located.project;
    const projects = await readable(principal, located);
    const [links, children, parent] = await Promise.all([
      issueLinks.listForIssue(ctx, located.issue.id),
      issuesRepo.listChildren(ctx, located.issue.id),
      located.issue.parent_id === null ? undefined : issuesRepo.findById(ctx, located.issue.parent_id),
    ]);
    const self = located.issue.id;
    const visible = links.filter(l => projects.byId.has(l.other.project_id));
    const members = (link: LinkName): IssueRow[] => {
      if (link.type === 'subtask') {
        if (link.direction === 'outward') return children;
        return parent && !parent.deleted_at ? [parent] : [];
      }
      return visible
        .filter(l => l.link.type === link.type)
        .filter(l => link.type === 'relates' || (link.direction === 'outward') === (l.link.from_issue_id === self))
        .map(l => l.other);
    };
    const all = DISPLAY_ORDER.map(name => ISSUE_LINK_NAMES.find(l => l.name === name)!).map(link => ({
      link,
      rows: members(link),
    }));
    const refs = await issues.refsOf(
      principal,
      ctx,
      all.flatMap(g => g.rows),
      projects.byId,
    );
    let offset = 0;
    return all.flatMap(({ link, rows }) => {
      const slice = refs.slice(offset, offset + rows.length);
      offset += rows.length;
      return rows.length === 0
        ? []
        : [{ link: link.name, type: link.type, direction: link.direction, count: rows.length, issues: slice }];
    });
  }

  function requireFor(principal: Principal, located: Located, link: LinkName) {
    issues.requireWritable(principal, located.project, link.type === 'subtask' ? 'issue.parent_set' : 'issue.link');
  }

  return {
    async list(principal: Principal, key: string, hints: OrgHints = {}): Promise<IssueLinkGroup[]> {
      return groups(principal, await issues.locate(principal, key, hints));
    },

    /** Every target in one transaction: one refusal links none of them. */
    async create(
      principal: Principal,
      key: string,
      input: CreateIssueLinks,
      hints: OrgHints = {},
    ): Promise<IssueLinkGroup[]> {
      const located = await issues.locate(principal, key, hints);
      const link = linkNamed(input.link);
      requireFor(principal, located, link);
      const projects = await readable(principal, located);
      const keyOf = keyer(projects.byId);
      const selfKey = keyOf(located.issue);
      const { ctx } = located.project;
      const targets = await resolveTargets(issuesRepo, ctx, projects, link, input.issues, 'issues', located.issue.id);

      await inTransaction(async repos => {
        const self = await repos.issues.lockById(ctx, located.issue.id);
        if (!self || self.deleted_at) throw new AppError('issue.not_found', 404, { key: selfKey }, 'key');
        const at = now();
        await writeLinks(repos, { ctx, actorId: principal.userId, keyOf, at, field: 'issues' }, link, self, targets);
        if (link.type !== 'subtask') {
          await repos.issues.update(ctx, self.id, { updated_by: principal.userId, updated_at: at });
        }
      });
      analytics.capture(
        'issues_linked',
        { via: principal.via, type: link.type, count: targets.length },
        { userId: principal.userId, orgId: located.project.organization.id },
      );
      return groups(principal, await issues.locate(principal, key, hints));
    },

    async remove(
      principal: Principal,
      key: string,
      targetKey: string,
      linkName: string,
      hints: OrgHints = {},
    ): Promise<IssueLinkGroup[]> {
      const located = await issues.locate(principal, key, hints);
      const link = linkNamed(linkName);
      requireFor(principal, located, link);
      const projects = await readable(principal, located);
      const keyOf = keyer(projects.byId);
      const selfKey = keyOf(located.issue);
      const params = { link: link.name, target: targetKey };
      const missing = () => new AppError('link.not_found', 404, { key: selfKey, ...params }, 'issues');
      const { ctx } = located.project;
      const other = await findTarget(issuesRepo, ctx, projects, targetKey);
      if (!other) throw new AppError('link.not_found', 404, { key: targetKey, ...params }, 'issues');

      await inTransaction(async repos => {
        const self = await repos.issues.lockById(ctx, located.issue.id);
        if (!self || self.deleted_at) throw new AppError('issue.not_found', 404, { key: selfKey }, 'key');
        const w: LinkWrite = { ctx, actorId: principal.userId, keyOf, at: now(), field: 'issues' };
        if (link.type === 'subtask') {
          const [child, parent] = link.direction === 'outward' ? [other, self] : [self, other];
          if (child.parent_id !== parent.id) throw missing();
          await moveParent(repos, w, child, null);
          return;
        }
        const removed = await repos.issueLinks.remove(ctx, canonicalEnds(link, self, other));
        if (!removed) throw missing();
        await recordBothSides(repos, w, 'unlinked', link, self, other);
        await repos.issues.update(ctx, self.id, { updated_by: principal.userId, updated_at: w.at });
      });
      return groups(principal, await issues.locate(principal, key, hints));
    },
  };
}

export type IssueLinksService = ReturnType<typeof issueLinksService>;
