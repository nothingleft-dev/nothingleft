import {
  checkValues,
  dateInZone,
  expandSavedViews,
  issueRegistry,
  parse,
  QueryError,
  shorthandNames,
  sortKeysOf,
  suggest,
  vocabularyNeeds,
  type CustomAttributeType,
  type Query,
  type Registry,
  type ValueProvider,
  type Vocabulary,
  type Weekday,
} from '@nothingleft/query';
import { CUSTOM_GROUP_PREFIX, STATUS_CATEGORIES, type CustomFieldKind, type IssueGroupBy } from '@nothingleft/types';
import type {
  IssueFigures,
  IssueGroup,
  LabelColor,
  MemberRef,
  Principal,
  ProjectRole,
  Suggestion,
} from '@nothingleft/types';
import {
  systemContext,
  type CustomFieldsRepository,
  type IssueContainer,
  type IssueGroupRow,
  type IssueSearchRepository,
  type IssueSearchResult,
  type IssuesRepository,
  type ProjectRow,
  type ProjectsRepository,
  type RecentSearchesRepository,
  type SavedViewRow,
  type SavedViewsRepository,
  type SearchScope,
  type SearchVocabulary,
  type TenantContext,
  type UsersRepository,
} from '@nothingleft/db';
import { t, type MessageKey } from '@nothingleft/i18n';
import { RECENT_SEARCHES_KEPT, SUGGEST_VALUES_MAX } from '@config/constants';
import { AppError } from '@lib/errors';
import type { AccessService, OrgAccess, ProjectAccess } from '@services/access';
import { can } from '@services/permissions';
import type { OrgHints } from '@services/tenancy.service';
import { emptyLabelOf, kindOf, loadCatalogue, searchFields, type FieldCatalogue } from '@services/custom-field-values';

const ATTRIBUTE_TYPE: Record<CustomFieldKind, CustomAttributeType> = {
  text: 'text',
  number: 'number',
  duration: 'duration',
  date: 'date',
  datetime: 'instant',
  checkbox: 'boolean',
  option: 'enum',
  person: 'user',
};

const GROUPABLE: ReadonlySet<CustomFieldKind> = new Set(['option', 'person', 'checkbox']);

/** The issue vocabulary plus the custom fields in scope, one attribute per slug. */
export function registryFor(cat: FieldCatalogue): Registry {
  const seen = new Set<string>();
  const customFields = cat.fields.flatMap(field => {
    if (seen.has(field.slug)) return [];
    seen.add(field.slug);
    return [{ slug: field.slug, name: field.name, type: ATTRIBUTE_TYPE[kindOf(field)], empty: emptyLabelOf(field) }];
  });
  return issueRegistry({ customFields });
}

export interface SearchDeps {
  access: AccessService;
  users: UsersRepository;
  projects: ProjectsRepository;
  issues: IssuesRepository;
  issueSearch: IssueSearchRepository;
  savedViews: SavedViewsRepository;
  recentSearches: RecentSearchesRepository;
  customFields: CustomFieldsRepository;
  now?: () => Date;
}

/** Who is searching, in which organisation, over which projects. */
export interface SearchContext {
  org: OrgAccess;
  /** Set when the search is scoped to one project. */
  project: ProjectAccess | null;
  ctx: TenantContext;
  projects: ProjectRow[];
  scope: SearchScope;
  /** The custom fields of `projects`, and the registry that knows their slugs. */
  catalogue: FieldCatalogue;
  registry: Registry;
}

const EMPTY_QUERY: Query = { clauses: [] };
const VIEW_FETCH_ROUNDS = 5;

const entry = (pairs: [accepted: string[], display: string][]) => ({
  accepted: new Set(pairs.flatMap(([accepted]) => accepted.map(a => a.toLowerCase()))),
  display: pairs.map(([, display]) => display),
});

function vocabularyOf(v: SearchVocabulary): Vocabulary {
  const names = (list: string[]) => entry(list.map(n => [[n], n]));
  return {
    ...Object.fromEntries(Object.entries(v.options).map(([slug, options]) => [slug, names(options)])),
    project: entry(v.projects.map(p => [[p.key, p.name], p.key])),
    status: names(v.statuses),
    priority: names(v.priorities),
    type: names(v.types),
    'work type': names(v.work_types),
    tag: entry(v.tags.map(tag => [[tag.name, tag.slug], tag.name])),
    sprint: entry(v.sprints.map(s => [[s.name, s.slug], s.name])),
    user: {
      accepted: new Set(v.usernames.map(u => u.username.toLowerCase())),
      display: v.usernames.filter(u => !u.removed).map(u => u.username),
    },
  };
}

/** Visible views by lower-cased name; own beats project beats org when names repeat. */
function byPrecedence(views: SavedViewRow[], userId: number): Map<string, SavedViewRow> {
  const rank = (v: SavedViewRow) => (v.owner_id === userId ? 0 : v.visibility === 'project' ? 1 : 2);
  const out = new Map<string, SavedViewRow>();
  for (const view of [...views].sort((a, b) => rank(a) - rank(b))) {
    const name = view.name.toLowerCase();
    if (!out.has(name)) out.set(name, view);
  }
  return out;
}

function countCustom(query: Query, registry: Registry): number {
  let n = 0;
  for (const clause of query.clauses) {
    if (clause.kind === 'attribute' && registry.attribute(clause.attribute)?.custom) n += 1;
    else if (clause.kind === 'aggregate' || clause.kind === 'view') n += countCustom(clause.query, registry);
  }
  return n;
}

export function searchService(deps: SearchDeps) {
  const { access, users, projects, issues, issueSearch, savedViews, recentSearches, customFields } = deps;
  const now = deps.now ?? (() => new Date());

  function wrap<T>(body: () => T, field = 'q'): T {
    try {
      return body();
    } catch (err) {
      if (err instanceof QueryError) throw AppError.fromQuery(err, field);
      throw err;
    }
  }

  async function readableProjects(principal: Principal, org: OrgAccess): Promise<ProjectRow[]> {
    const everyProject = org.scope.isOwner || org.scope.orgRole === 'org_admin';
    const rows = await projects.listReadable(org.ctx, principal.userId, { everyProject });
    return rows
      .filter(r =>
        can(principal, 'issue.read', {
          ...org.scope,
          projectRole: (r.role as ProjectRole | null) ?? null,
          projectId: r.project.id,
        }),
      )
      .map(r => r.project);
  }

  /** `projectKeys` narrows the scope to those projects; each must be readable, and all in one organisation. */
  async function context(
    principal: Principal,
    hints: OrgHints,
    projectKeys?: string | readonly string[],
  ): Promise<SearchContext> {
    let org: OrgAccess;
    let scoped: ProjectRow[];
    let project: ProjectAccess | null = null;
    const keys = [
      ...new Set((typeof projectKeys === 'string' ? [projectKeys] : (projectKeys ?? [])).map(k => k.toUpperCase())),
    ];
    if (keys.length > 0) {
      const found: ProjectAccess[] = [];
      for (const key of keys) {
        const one = await access.project(
          principal,
          key,
          found[0] ? { ...hints, slug: found[0].organization.slug } : hints,
        );
        access.require(principal, 'issue.read', one.scope);
        if (found[0] && one.organization.id !== found[0].organization.id) {
          throw new AppError('project.not_found', 404, { key }, 'key');
        }
        found.push(one);
      }
      project = found.length === 1 ? found[0]! : null;
      org = found[0]!;
      scoped = found.map(f => f.project);
    } else {
      org = await access.current(principal, hints);
      scoped = await readableProjects(principal, org);
    }
    access.require(principal, 'search.run', org.scope);
    const user = await users.findById(systemContext('the searcher’s own timezone'), principal.userId);
    const timezone = user?.timezone ?? 'UTC';
    const at = now();
    const week = org.organization.week_starts_on;
    const catalogue = await loadCatalogue(
      customFields,
      org.ctx,
      scoped.map(p => p.id),
    );
    return {
      org,
      project,
      ctx: org.ctx,
      projects: scoped,
      catalogue,
      registry: registryFor(catalogue),
      scope: {
        customFields: searchFields(catalogue),
        projectIds: scoped.map(p => p.id),
        timezone,
        today: dateInZone(at, timezone),
        weekStartsOn: (week === 0 ? 7 : week) as Weekday,
        now: at,
        calendar: {
          workdayMinutes: org.organization.workday_minutes,
          workweekDays: org.organization.workweek_days,
        },
      },
    };
  }

  async function visibleViews(principal: Principal, sc: SearchContext, names: string[]) {
    const found = new Map<string, SavedViewRow>();
    let wanted = names;
    for (let round = 0; round < VIEW_FETCH_ROUNDS && wanted.length > 0; round += 1) {
      const rows = await savedViews.findVisibleByNames(sc.ctx, principal.userId, sc.scope.projectIds, wanted);
      for (const [name, view] of byPrecedence(rows, principal.userId)) if (!found.has(name)) found.set(name, view);
      wanted = [
        ...new Set(rows.flatMap(r => shorthandNames(r.query_ast as Query)).filter(n => !found.has(n.toLowerCase()))),
      ];
    }
    return found;
  }

  /** Query text → a checked AST with saved views expanded, or a 400 naming the fault. */
  async function compile(
    principal: Principal,
    sc: SearchContext,
    text: string | undefined,
    sortText?: string,
    options: { asView?: { name: string; query: Query }; field?: string } = {},
  ) {
    const { asView, field = 'q' } = options;
    const trimmed = text?.trim() ?? '';
    const registry = sc.registry;
    const parsed = trimmed ? wrap(() => parse(trimmed, registry), field) : { query: EMPTY_QUERY, spans: [] };
    const views = await visibleViews(principal, sc, shorthandNames(parsed.query));
    const lookup = (name: string) =>
      asView && name.toLowerCase() === asView.name.toLowerCase()
        ? asView.query
        : (views.get(name.toLowerCase())?.query_ast as Query | undefined);
    const query = wrap(() => expandSavedViews(parsed.query, lookup, asView?.name), field);
    const needs = vocabularyNeeds(query, registry);
    if (needs.size > 0) {
      const optionSlugs = registry.attributes.filter(a => a.custom && a.type === 'enum').map(a => a.name);
      const vocabulary = vocabularyOf(await issueSearch.vocabulary(sc.ctx, sc.scope.projectIds, needs, optionSlugs));
      wrap(() => checkValues(query, registry, vocabulary, parsed.spans), field);
    }
    const override = sortText?.trim()
      ? wrap(() => sortKeysOf(parse(`sort by: ${sortText}`, registry).query), 'sort')
      : null;
    return { query, sort: override ?? sortKeysOf(query), text: trimmed };
  }

  /** `custom:<slug>` must name a field in scope that can group; the rest are the built-in fields. */
  function checkGroupBy(sc: SearchContext, groupBy: IssueGroupBy | undefined) {
    if (!groupBy?.startsWith(CUSTOM_GROUP_PREFIX)) return;
    const slug = groupBy.slice(CUSTOM_GROUP_PREFIX.length);
    const groupable = sc.catalogue.fields.filter(f => GROUPABLE.has(kindOf(f)));
    if (!groupable.some(f => f.slug === slug)) {
      throw new AppError('search.not_groupable', 400, { field: groupBy }, 'group_by', [
        ...new Set(groupable.map(f => `${CUSTOM_GROUP_PREFIX}${f.slug}`)),
      ]);
    }
  }

  function groupLabel(sc: SearchContext, field: IssueGroupBy, row: IssueGroupRow): string {
    if (field.startsWith(CUSTOM_GROUP_PREFIX)) {
      const custom = sc.catalogue.fields.find(f => f.slug === field.slice(CUSTOM_GROUP_PREFIX.length));
      if (row.key === '' && custom)
        return custom.type === 'checkbox' ? t('custom_field.checkbox.no') : emptyLabelOf(custom);
      return row.label ?? row.value ?? '';
    }
    if (field === 'due') {
      return t(`issue.group.due.${row.key === '' ? 'none' : row.key}` as MessageKey);
    }
    if (row.key === '') {
      if (field === 'assignee') return t('issue.group.unassigned');
      if (field === 'tag') return t('issue.group.no_tags');
      if (field === 'sprint') return t('issue.group.no_sprint');
    }
    return row.label ?? row.value ?? '';
  }

  const toGroups = (sc: SearchContext, field: IssueGroupBy, rows: IssueGroupRow[]): IssueGroup[] =>
    rows.map(row => ({
      value: row.value,
      label: groupLabel(sc, field, row),
      count: row.count,
      color: row.color as LabelColor | null,
      ...(row.category ? { category: row.category } : {}),
    }));

  const memberRefs = async (ctx: TenantContext, userIds: number[]): Promise<Map<number, MemberRef>> => {
    const people = await issues.findPeople(ctx, userIds);
    return new Map(people.map(p => [p.user.id, access.memberRef(p.user, p.membership)]));
  };

  return {
    context,
    compile,
    readableProjects,
    checkGroupBy,
    groupLabel,

    async search(
      principal: Principal,
      sc: SearchContext,
      input: {
        q?: string | undefined;
        sort?: string | undefined;
        groupBy?: IssueGroupBy | undefined;
        groupLimit?: number | undefined;
        container?: IssueContainer | undefined;
        limit: number;
        offset: number;
        // The grouped search box passes false: its keystrokes are not searches worth recalling.
        record?: boolean;
      },
    ): Promise<IssueSearchResult & { groupsDto: IssueGroup[] | undefined; customAttributeCount: number }> {
      checkGroupBy(sc, input.groupBy);
      const compiled = await compile(principal, sc, input.q, input.sort);
      const result = await issueSearch.search(sc.ctx, sc.scope, compiled.query, {
        sort: compiled.sort,
        groupBy: input.groupBy,
        groupLimit: input.groupLimit,
        container: input.container,
        limit: input.limit,
        offset: input.offset,
      });
      if (compiled.text && principal.via === 'session' && input.record !== false) {
        await recentSearches.record(sc.ctx, principal.userId, compiled.text, RECENT_SEARCHES_KEPT, sc.scope.now);
      }
      return {
        ...result,
        groupsDto: input.groupBy && result.groups ? toGroups(sc, input.groupBy, result.groups) : undefined,
        customAttributeCount: countCustom(compiled.query, sc.registry),
      };
    },

    async suggest(principal: Principal, text: string, caret: number, hints: OrgHints = {}): Promise<Suggestion[]> {
      const sc = await context(principal, hints);
      const ids = sc.scope.projectIds;
      const lookup = (attribute: string, prefix: string) =>
        issueSearch.suggestValues(sc.ctx, ids, attribute, prefix, SUGGEST_VALUES_MAX);
      const provider: ValueProvider = {
        async values(attribute, prefix) {
          const name = attribute.type === 'user' ? 'user' : attribute.name;
          return (await lookup(name, prefix)).map(value => ({ value }));
        },
        async savedSearches(prefix) {
          const views = await savedViews.listVisible(sc.ctx, principal.userId, ids);
          const needle = prefix.toLowerCase();
          return [...byPrecedence(views, principal.userId).values()]
            .map(v => v.name)
            .filter(name => name.toLowerCase().includes(needle))
            .slice(0, SUGGEST_VALUES_MAX);
        },
        async recentSearches() {
          return (await recentSearches.list(sc.ctx, principal.userId, SUGGEST_VALUES_MAX)).map(r => r.query);
        },
      };
      const suggestions = await suggest(text, caret, sc.registry, provider, {
        today: sc.scope.today,
        weekStartsOn: sc.scope.weekStartsOn,
      });
      return suggestions.map(s => ({
        kind: s.kind,
        label: s.label,
        insert: s.insert,
        replace: s.replace,
        description: s.description ? t(s.description.key, s.description.params) : null,
      }));
    },

    async clearRecent(principal: Principal, hints: OrgHints = {}): Promise<{ cleared: number }> {
      const org = await access.current(principal, hints);
      return { cleared: await recentSearches.clear(org.ctx, principal.userId) };
    },

    async figures(
      principal: Principal,
      input: { q?: string | undefined; project?: string | undefined; per?: 'project' | undefined },
      hints: OrgHints = {},
    ): Promise<IssueFigures[]> {
      const sc = await context(principal, hints, input.project);
      access.require(principal, 'report.read', sc.org.scope);
      const { query } = await compile(principal, sc, input.q);
      const perProject = input.per === 'project';
      const rows = await issueSearch.figures(sc.ctx, sc.scope, query, { perProject });
      const people = await memberRefs(
        sc.ctx,
        rows.flatMap(r => r.by_assignee.map(a => a.user_id)),
      );
      const byProject = new Map(rows.map(r => [r.project_id, r]));
      const targets: (ProjectRow | null)[] = perProject ? sc.projects : [null];
      return targets.map(project => {
        const row = byProject.get(project?.id ?? null);
        const by_category = Object.fromEntries(
          STATUS_CATEGORIES.map(c => [c, row?.by_category[c] ?? 0]),
        ) as IssueFigures['by_category'];
        return {
          project: project ? { key: project.key, name: project.name } : null,
          open: row?.open ?? 0,
          unassigned: row?.unassigned ?? 0,
          overdue: row?.overdue ?? 0,
          due_today: row?.due_today ?? 0,
          created_7d: row?.created_7d ?? 0,
          resolved_7d: row?.resolved_7d ?? 0,
          resolved_prev_7d: row?.resolved_prev_7d ?? 0,
          by_category,
          by_assignee: (row?.by_assignee ?? []).map(a => ({
            member: people.get(a.user_id) ?? {
              username: '',
              name: '',
              avatar_url: null,
              former_member: true,
              deactivated: false,
            },
            open: a.open,
          })),
          logged_minutes_this_week: row?.logged_minutes_this_week ?? 0,
          last_updated_at: row?.last_updated_at?.toISOString() ?? null,
        };
      });
    },
  };
}

export type SearchService = ReturnType<typeof searchService>;
