import type {
  CreateSavedView,
  Principal,
  ProjectRole,
  SavedView,
  SavedViewVisibility,
  UpdateSavedView,
} from '@nothingleft/types';
import { parse, QueryError, render, sortKeysOf, type Query, type SortKey } from '@nothingleft/query';
import type { IssuesRepository, ProjectRow, SavedViewRow, SavedViewsRepository } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { denial, type AccessService, type OrgAccess } from '@services/access';
import { can, type Scope } from '@services/permissions';
import type { SearchContext, SearchService } from '@services/search.service';
import type { OrgHints } from '@services/tenancy.service';

export interface SavedViewsDeps {
  access: AccessService;
  search: SearchService;
  savedViews: SavedViewsRepository;
  issues: IssuesRepository;
  analytics: Analytics;
}

const ROLE_RANK: Record<ProjectRole, number> = { observer: 0, contributor: 1, project_admin: 2 };

export function savedViewsService({ access, search, savedViews, issues, analytics }: SavedViewsDeps) {
  const notFound = (name: string) => new AppError('saved_view.not_found', 404, { name }, 'name');

  /**
   * The scope a shared-view cell is checked in: the view's project, or for an org-wide
   * view the caller's strongest project membership, so a contributor anywhere may share.
   */
  async function sharedScope(principal: Principal, sc: SearchContext, projectId: number | null): Promise<Scope> {
    const org: OrgAccess = sc.org;
    if (org.scope.isOwner || org.scope.orgRole === 'org_admin') return org.scope;
    if (projectId !== null) {
      const project = await access.projectById(principal, org, projectId);
      return project.scope;
    }
    let best: { role: ProjectRole; projectId: number } | null = null;
    for (const project of sc.projects) {
      const scope = (await access.projectById(principal, org, project.id)).scope;
      const role = scope.projectRole;
      if (role && (!best || ROLE_RANK[role] > ROLE_RANK[best.role])) best = { role, projectId: project.id };
    }
    return { ...org.scope, projectRole: best?.role ?? null, ...(best ? { projectId: best.projectId } : {}) };
  }

  async function canEdit(principal: Principal, sc: SearchContext, view: SavedViewRow): Promise<boolean> {
    const own = view.owner_id === principal.userId;
    if (view.visibility === 'private') return own && can(principal, 'saved_view.create_private', sc.org.scope);
    const scope = await sharedScope(principal, sc, view.visibility === 'project' ? view.project_id : null);
    return can(principal, 'saved_view.update_shared', { ...scope, isOwnRecord: own });
  }

  async function requireEdit(principal: Principal, sc: SearchContext, view: SavedViewRow): Promise<void> {
    if (await canEdit(principal, sc, view)) return;
    if (view.visibility === 'private') throw AppError.forbidden();
    const scope = await sharedScope(principal, sc, view.visibility === 'project' ? view.project_id : null);
    const own = view.owner_id === principal.userId;
    throw denial(principal, 'saved_view.update_shared', { ...scope, isOwnRecord: own }, AppError.forbidden);
  }

  async function requireCreate(
    principal: Principal,
    sc: SearchContext,
    visibility: SavedViewVisibility,
    projectId: number | null,
  ) {
    if (visibility === 'private') {
      access.require(principal, 'saved_view.create_private', sc.org.scope);
      return;
    }
    const scope = await sharedScope(principal, sc, visibility === 'project' ? projectId : null);
    access.require(principal, 'saved_view.create_shared', scope);
  }

  async function toDto(principal: Principal, sc: SearchContext, view: SavedViewRow): Promise<SavedView> {
    const project = view.project_id === null ? undefined : sc.projects.find(p => p.id === view.project_id);
    const [owner] = await issues.findPeople(sc.ctx, [view.owner_id]);
    return {
      name: view.name,
      query: view.query,
      visibility: view.visibility as SavedViewVisibility,
      project: project ? { key: project.key, name: project.name } : null,
      owner: owner
        ? access.memberRef(owner.user, owner.membership)
        : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
      sort: view.sort as SortKey[],
      columns: view.columns,
      position: view.position,
      can_edit: await canEdit(principal, sc, view),
      created_at: view.created_at.toISOString(),
      updated_at: view.updated_at.toISOString(),
    };
  }

  async function find(principal: Principal, sc: SearchContext, name: string): Promise<SavedViewRow> {
    const rows = await savedViews.findVisibleByNames(sc.ctx, principal.userId, sc.scope.projectIds, [name]);
    const rank = (v: SavedViewRow) => (v.owner_id === principal.userId ? 0 : v.visibility === 'project' ? 1 : 2);
    const view = rows.sort((a, b) => rank(a) - rank(b))[0];
    if (!view) throw notFound(name);
    return view;
  }

  async function nameFree(principal: Principal, sc: SearchContext, name: string, exceptId?: number) {
    const clash = await savedViews.findVisibleByNames(sc.ctx, principal.userId, sc.scope.projectIds, [name]);
    if (clash.some(v => v.id !== exceptId)) throw new AppError('saved_view.name_taken', 409, { name }, 'name');
  }

  function projectIdOf(sc: SearchContext, key: string | null | undefined): number | null {
    if (!key) return null;
    const project: ProjectRow | undefined = sc.projects.find(p => p.key.toLowerCase() === key.toLowerCase());
    if (!project) throw new AppError('project.not_found', 404, { key }, 'project');
    return project.id;
  }

  /** The view's query must stand on its own now, including any views it references. */
  async function checkedQuery(
    principal: Principal,
    sc: SearchContext,
    name: string,
    text: string,
    sortText?: string | null,
  ) {
    const parsed = (source: string, field: string) => {
      try {
        return parse(source, sc.registry).query;
      } catch (err) {
        if (err instanceof QueryError) throw AppError.fromQuery(err, field);
        throw err;
      }
    };
    const ast: Query = text.trim() ? parsed(text.trim(), 'query') : { clauses: [] };
    await search.compile(principal, sc, text, sortText ?? undefined, { asView: { name, query: ast }, field: 'query' });
    const sort = sortText?.trim() ? sortKeysOf(parsed(`sort by: ${sortText}`, 'sort')) : [];
    return { query: render(ast, sc.registry), ast, sort };
  }

  return {
    async list(principal: Principal, hints: OrgHints = {}): Promise<SavedView[]> {
      const sc = await search.context(principal, hints);
      const views = await savedViews.listVisible(sc.ctx, principal.userId, sc.scope.projectIds);
      return Promise.all(views.map(v => toDto(principal, sc, v)));
    },

    async get(principal: Principal, name: string, hints: OrgHints = {}): Promise<SavedView> {
      const sc = await search.context(principal, hints);
      return toDto(principal, sc, await find(principal, sc, name));
    },

    async create(principal: Principal, input: CreateSavedView, hints: OrgHints = {}): Promise<SavedView> {
      const sc = await search.context(principal, hints);
      const projectId = projectIdOf(sc, input.project);
      if (input.visibility === 'project' && projectId === null) {
        throw new AppError('saved_view.project_required', 400, {}, 'project');
      }
      await requireCreate(principal, sc, input.visibility, projectId);
      await nameFree(principal, sc, input.name);
      const checked = await checkedQuery(principal, sc, input.name, input.query, input.sort);
      const row = await savedViews.insert(sc.ctx, {
        owner_id: principal.userId,
        project_id: projectId,
        name: input.name,
        query: checked.query,
        query_ast: checked.ast,
        sort: checked.sort,
        columns: input.columns ?? [],
        visibility: input.visibility,
      });
      analytics.capture(
        'saved_view_created',
        { visibility: input.visibility },
        { userId: principal.userId, orgId: sc.org.organization.id },
      );
      return toDto(principal, sc, row);
    },

    async update(principal: Principal, name: string, input: UpdateSavedView, hints: OrgHints = {}): Promise<SavedView> {
      const sc = await search.context(principal, hints);
      const view = await find(principal, sc, name);
      await requireEdit(principal, sc, view);

      const visibility = input.visibility ?? (view.visibility as SavedViewVisibility);
      const projectId = input.project !== undefined ? projectIdOf(sc, input.project) : view.project_id;
      if (visibility === 'project' && projectId === null) {
        throw new AppError('saved_view.project_required', 400, {}, 'project');
      }
      if (visibility !== view.visibility || projectId !== view.project_id) {
        await requireCreate(principal, sc, visibility, projectId);
      }
      if (input.name !== undefined && input.name.toLowerCase() !== view.name.toLowerCase()) {
        await nameFree(principal, sc, input.name, view.id);
      }
      const patch: Parameters<SavedViewsRepository['update']>[2] = {
        visibility,
        project_id: projectId,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.columns !== undefined ? { columns: input.columns } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      };
      if (input.query !== undefined || input.sort !== undefined) {
        const sortText =
          input.sort !== undefined
            ? input.sort
            : (view.sort as SortKey[]).map(k => `{${k.attribute}} ${k.direction}`).join(', ');
        const checked = await checkedQuery(principal, sc, input.name ?? view.name, input.query ?? view.query, sortText);
        Object.assign(patch, { query: checked.query, query_ast: checked.ast, sort: checked.sort });
      }
      const row = await savedViews.update(sc.ctx, view.id, patch);
      return toDto(principal, sc, row!);
    },

    async remove(principal: Principal, name: string, hints: OrgHints = {}): Promise<SavedView> {
      const sc = await search.context(principal, hints);
      const view = await find(principal, sc, name);
      await requireEdit(principal, sc, view);
      const dto = await toDto(principal, sc, view);
      await savedViews.remove(sc.ctx, view.id);
      return dto;
    },
  };
}

export type SavedViewsService = ReturnType<typeof savedViewsService>;
