import {
  BOARD_CARDS_MAX,
  BOARD_SWIMLANE_FIELDS,
  type BoardColumnField,
  type BoardValueCount,
  type BoardValueRef,
  RESOLVED_STATUS_CATEGORIES,
  SEED_BOARD_COLUMNS,
  SEED_BOARD_SWIMLANE_TYPE,
  type Board,
  type BoardCard,
  type BoardColumnInput,
  type BoardLane,
  type BoardSwimlane,
  type BoardSwimlaneField,
  type BoardView,
  type CreateBoard,
  type LabelColor,
  type Principal,
  type StatusCategory,
  type UpdateBoard,
} from '@nothingleft/types';
import type {
  BoardColumnInsert,
  BoardLayout,
  BoardRow,
  BoardsRepository,
  IssueRow,
  IssuesRepository,
  IssueSearchRepository,
  IssueTypeRow,
  PriorityRow,
  ProjectSchemaRepository,
  SprintRow,
  SprintsRepository,
  WorkflowStatusRow,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { uniqueSlug } from '@nothingleft/format';
import { t } from '@nothingleft/i18n';
import { AppError } from '@lib/errors';
import { withUniqueAs } from '@lib/pg-errors';
import type { AccessService, ProjectAccess } from '@services/access';
import type { FieldCatalogue } from '@services/custom-field-values';
import { dailyOnce, type DailyOnceStore } from '@services/daily-once';
import type { IssuesService } from '@services/issues.service';
import type { SearchService } from '@services/search.service';
import { statusCountsOf, type SprintsService } from '@services/sprints.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

export interface BoardsDeps {
  access: AccessService;
  search: SearchService;
  issuesService: IssuesService;
  sprintsService: SprintsService;
  boards: BoardsRepository;
  sprints: SprintsRepository;
  issues: IssuesRepository;
  issueSearch: IssueSearchRepository;
  schema: ProjectSchemaRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  redis: DailyOnceStore;
  now?: () => Date;
}

export interface BoardViewQuery {
  /** `current` (the default) is the active sprint; otherwise a sprint's name or slug. */
  sprint?: string | undefined;
  q?: string | undefined;
  swimlane_by?: BoardSwimlane | undefined;
  swimlane_field?: BoardSwimlaneField | undefined;
}

export const CURRENT_SPRINT = 'current';

interface Placed {
  row: IssueRow;
  card: BoardCard;
}

const isResolved = (category: string) => (RESOLVED_STATUS_CATEGORIES as readonly string[]).includes(category);
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A status, priority or type: the three value tables share these columns. */
type ValueRow = (WorkflowStatusRow | PriorityRow | IssueTypeRow) & { category?: string; is_archived?: boolean };

interface ProjectValues {
  statuses: WorkflowStatusRow[];
  priorities: PriorityRow[];
  types: IssueTypeRow[];
}

type CardsPreloaded = { catalogue: FieldCatalogue; values: ProjectValues };

const valuesFor = (values: ProjectValues, field: BoardColumnField): ValueRow[] =>
  field === 'status' ? values.statuses : field === 'priority' ? values.priorities : values.types;

const valueRef = (v: ValueRow): BoardValueRef => ({
  name: v.name,
  color: v.color as LabelColor,
  short_label: v.short_label,
  category: v.category ? (v.category as StatusCategory) : null,
});

/** The issue's value of the board's column field: which column its card sits in. */
const valueOf = (row: IssueRow, field: BoardColumnField) =>
  field === 'status' ? row.status_id : field === 'priority' ? row.priority_id : row.type_id;

const choosable = (values: ValueRow[]) => values.filter(v => !v.is_archived);

function valueCountsOf(values: ValueRow[], counts: Map<number, number>): BoardValueCount[] {
  return values.flatMap(v => {
    const count = counts.get(v.id) ?? 0;
    if (count === 0) return [];
    const { name, color, category } = valueRef(v);
    return [{ name, color, category, count }];
  });
}

export function boardsService(deps: BoardsDeps) {
  const { access, search, issuesService, sprintsService, boards, issues, issueSearch, schema, inTransaction } = deps;
  const now = deps.now ?? (() => new Date());

  async function valuesOf(project: ProjectAccess): Promise<ProjectValues> {
    const [statuses, priorities, types] = await Promise.all([
      schema.list(project.ctx, 'statuses', project.project.id),
      schema.list(project.ctx, 'priorities', project.project.id),
      schema.list(project.ctx, 'types', project.project.id),
    ]);
    return { statuses, priorities, types };
  }

  function dto(
    project: ProjectAccess,
    row: BoardRow,
    layout: BoardLayout,
    values: ProjectValues,
    creator: Board['created_by'],
  ): Board {
    const field = row.column_field as BoardColumnField;
    const all = valuesFor(values, field);
    const byId = new Map(all.map(v => [v.id, v]));
    const mapped = new Set(layout.columns.flatMap(c => c.value_ids));
    return {
      name: row.name,
      slug: row.slug,
      project: { key: project.project.key, name: project.project.name },
      column_field: field,
      columns: layout.columns.map(c => {
        const members = c.value_ids.flatMap(id => byId.get(id) ?? []);
        return {
          name: c.name,
          values: members.map(valueRef),
          wip_min: c.wip_min,
          wip_max: c.wip_max,
          collapsed_by_default: c.is_collapsed_by_default,
          resolved: field === 'status' && members.length > 0 && members.every(v => isResolved(v.category!)),
        };
      }),
      unmapped_values: choosable(all)
        .filter(v => !mapped.has(v.id))
        .map(valueRef),
      swimlane_by: row.swimlane_by as BoardSwimlane,
      swimlane_field: row.swimlane_field as BoardSwimlaneField | null,
      swimlane_types: layout.swimlane_type_ids.flatMap(id => values.types.find(t => t.id === id)?.name ?? []),
      created_by: creator,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  async function present(project: ProjectAccess, rows: BoardRow[]): Promise<Board[]> {
    if (rows.length === 0) return [];
    return (await presentWith(project, rows)).boards;
  }

  /** The boards, with the layouts and project values they were built from. */
  async function presentWith(project: ProjectAccess, rows: BoardRow[]) {
    const [layouts, values, people] = await Promise.all([
      boards.layout(
        project.ctx,
        rows.map(r => r.id),
      ),
      valuesOf(project),
      issues.findPeople(
        project.ctx,
        rows.map(r => r.created_by),
      ),
    ]);
    const dtos = rows.map(row => {
      const p = people.find(x => x.user.id === row.created_by);
      const creator = p
        ? access.memberRef(p.user, p.membership)
        : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false };
      return dto(project, row, layouts.get(row.id)!, values, creator);
    });
    return { boards: dtos, layouts, values };
  }

  async function resolveBoard(project: ProjectAccess, value: string): Promise<BoardRow> {
    const row = await boards.find(project.ctx, project.project.id, value);
    if (row) return row;
    const all = await boards.list(project.ctx, project.project.id);
    throw new AppError(
      'board.not_found',
      404,
      { board: value, project: project.project.key },
      'board',
      all.map(b => b.name),
    );
  }

  function requireManage(principal: Principal, project: ProjectAccess) {
    issuesService.requireWritable(principal, project, 'project.agile.manage');
  }

  function columnsFrom(
    project: ProjectAccess,
    input: BoardColumnInput[],
    field: BoardColumnField,
    values: ValueRow[],
  ): BoardColumnInsert[] {
    const names = new Set<string>();
    const used = new Set<number>();
    return input.map((c): BoardColumnInsert => {
      if (names.has(c.name.toLowerCase())) {
        throw new AppError('board.column_name_taken', 400, { name: c.name }, 'columns');
      }
      names.add(c.name.toLowerCase());
      const wipMin = c.wip_min ?? null;
      const wipMax = c.wip_max ?? null;
      if (wipMin !== null && wipMax !== null && wipMin > wipMax) {
        throw new AppError('board.wip_out_of_order', 400, { column: c.name }, 'columns');
      }
      const ids = c.values.map(name => {
        const value = values.find(v => sameName(v.name, name));
        if (!value) {
          throw new AppError(
            'board.unknown_value',
            400,
            { value: name, field, project: project.project.key },
            'columns',
            choosable(values).map(v => v.name),
          );
        }
        if (used.has(value.id)) throw new AppError('board.value_twice', 400, { value: value.name }, 'columns');
        used.add(value.id);
        return value.id;
      });
      return {
        name: c.name,
        wip_min: wipMin,
        wip_max: wipMax,
        is_collapsed_by_default: c.collapsed_by_default ?? false,
        value_ids: ids,
      };
    });
  }

  const seededColumns = (statuses: WorkflowStatusRow[]): BoardColumnInsert[] =>
    SEED_BOARD_COLUMNS.map(c => ({
      name: c.name,
      wip_min: null,
      wip_max: null,
      is_collapsed_by_default: false,
      value_ids: statuses.filter(s => (c.categories as readonly string[]).includes(s.category)).map(s => s.id),
    }));

  /** One column per value of the field, in the project's order. */
  const columnPerValue = (values: ValueRow[]): BoardColumnInsert[] =>
    choosable(values).map(v => ({
      name: v.name,
      wip_min: null,
      wip_max: null,
      is_collapsed_by_default: false,
      value_ids: [v.id],
    }));

  /** Lanes by the very field the columns split on would put every card in one cell per lane. */
  function checkLanesAgainstColumns(by: BoardSwimlane, laneField: BoardSwimlaneField | null, field: BoardColumnField) {
    if (by === 'values' && laneField === field) {
      throw new AppError(
        'board.swimlane_same_as_columns',
        400,
        { field },
        'swimlane_field',
        BOARD_SWIMLANE_FIELDS.filter(f => f !== field),
      );
    }
  }

  /** The swimlane settings a write leaves the board with, checked together. */
  function swimlanesFrom(
    project: ProjectAccess,
    types: IssueTypeRow[],
    by: BoardSwimlane,
    field: BoardSwimlaneField | null,
    typeNames: string[] | undefined,
    currentTypeIds: number[],
  ): { by: BoardSwimlane; field: BoardSwimlaneField | null; typeIds: number[] } {
    if (by === 'values' && !field) {
      throw new AppError('board.swimlane_field_required', 400, {}, 'swimlane_field', [...BOARD_SWIMLANE_FIELDS]);
    }
    let typeIds = currentTypeIds;
    if (typeNames) {
      typeIds = typeNames.map(name => {
        const type = types.find(t => sameName(t.name, name));
        if (!type) {
          throw new AppError(
            'board.unknown_type',
            400,
            { type: name, project: project.project.key },
            'swimlane_types',
            types.map(t => t.name),
          );
        }
        return type.id;
      });
    }
    if (by === 'issues' && typeIds.length === 0) {
      const epic = types.find(t => sameName(t.name, SEED_BOARD_SWIMLANE_TYPE));
      if (!epic || typeNames) {
        throw new AppError(
          'board.swimlane_types_required',
          400,
          {},
          'swimlane_types',
          types.map(t => t.name),
        );
      }
      typeIds = [epic.id];
    }
    return { by, field: by === 'values' ? field : null, typeIds };
  }

  async function checkName(project: ProjectAccess, name: string, self?: number) {
    const all = await boards.list(project.ctx, project.project.id);
    if (all.some(b => b.id !== self && sameName(b.name, name))) {
      throw new AppError('board.name_taken', 409, { name, project: project.project.key }, 'name');
    }
  }

  const slugFor = async (project: ProjectAccess, name: string) => {
    const taken = await boards.slugsInOrg(project.ctx);
    return uniqueSlug(name, taken) || uniqueSlug(`${project.project.key}-board`, taken);
  };

  /** Cards into lanes, each lane split by column, in the cards' drag order. */
  async function lanesOf(
    project: ProjectAccess,
    by: BoardSwimlane,
    field: BoardSwimlaneField | null,
    layout: BoardLayout,
    onBoard: Placed[],
    columnNames: string[],
    columnOf: Map<number, string>,
    columnField: BoardColumnField,
    preloaded: CardsPreloaded,
  ): Promise<BoardLane[]> {
    type Draft = Omit<BoardLane, 'cells' | 'count'> & { order: number; cards: Placed[] };
    const drafts = new Map<string, Draft>();
    const uncategorized: Draft = {
      kind: 'uncategorized',
      key: null,
      label: t('board.lane.uncategorized'),
      issue: null,
      member: null,
      order: Number.MAX_SAFE_INTEGER,
      cards: [],
    };
    const laneFor = (id: string, make: () => Omit<Draft, 'cards'>) => {
      if (!drafts.has(id)) drafts.set(id, { ...make(), cards: [] });
      return drafts.get(id)!;
    };

    if (by === 'none') {
      drafts.set('all', { kind: 'all', key: null, label: '', issue: null, member: null, order: 0, cards: onBoard });
    } else if (by === 'values') {
      const list = field === 'priority' ? preloaded.values.priorities : preloaded.values.types;
      for (const placed of onBoard) {
        const { card } = placed;
        if (field === 'assignee') {
          const first = [...card.assignees].sort((a, b) => a.username.localeCompare(b.username))[0];
          if (!first) {
            uncategorized.cards.push(placed);
            continue;
          }
          laneFor(`@${first.username.toLowerCase()}`, () => ({
            kind: 'value',
            key: first.username,
            label: first.name,
            issue: null,
            member: first,
            order: 0,
          })).cards.push(placed);
        } else {
          const name = field === 'priority' ? card.priority.name : card.type.name;
          laneFor(name.toLowerCase(), () => ({
            kind: 'value',
            key: name,
            label: name,
            issue: null,
            member: null,
            order: list.findIndex(v => v.name === name),
          })).cards.push(placed);
        }
      }
    } else {
      const laneOf = await issues.nearestAncestorOfTypes(
        project.ctx,
        onBoard.map(p => p.row.id),
        layout.swimlane_type_ids,
      );
      const typeIds = new Set(layout.swimlane_type_ids);
      // A card of a lane type heads its own lane rather than sitting in a column.
      const headIds = onBoard.filter(p => typeIds.has(p.row.type_id)).map(p => p.row.id);
      const laneIds = [...new Set([...laneOf.values(), ...headIds])];
      const laneRows = (await issues.findByIds(project.ctx, laneIds)).filter(r => r.deleted_at === null);
      const laneCards = await issuesService.boardCards(project, laneRows, preloaded);
      const laneById = new Map(laneRows.map((r, i) => [r.id, laneCards[i]!]));
      const open = (id: number) => {
        const lane = laneById.get(id)!;
        return laneFor(lane.key, () => ({
          kind: 'issue',
          key: lane.key,
          label: lane.title,
          issue: lane,
          member: null,
          order: 0,
        }));
      };
      for (const id of headIds) if (laneById.has(id)) open(id);
      for (const placed of onBoard) {
        if (headIds.includes(placed.row.id)) continue;
        const laneId = laneOf.get(placed.row.id);
        if (laneId === undefined || !laneById.has(laneId)) uncategorized.cards.push(placed);
        else open(laneId).cards.push(placed);
      }
    }

    const ordered = [...drafts.values()].sort(
      (a, b) => a.order - b.order || (a.member && b.member ? a.label.localeCompare(b.label) : 0),
    );
    if (by !== 'none') ordered.push(uncategorized);
    return ordered.map(lane => ({
      kind: lane.kind,
      key: lane.key,
      label: lane.label,
      issue: lane.issue,
      member: lane.member,
      count: lane.cards.length,
      cells: columnNames.map(column => ({
        column,
        cards: lane.cards.filter(p => columnOf.get(valueOf(p.row, columnField)) === column).map(p => p.card),
      })),
    }));
  }

  return {
    async list(principal: Principal, key: string, hints: OrgHints = {}): Promise<Board[]> {
      const project = await access.project(principal, key, hints);
      return present(project, await boards.list(project.ctx, project.project.id));
    },

    async get(principal: Principal, key: string, value: string, hints: OrgHints = {}): Promise<Board> {
      const project = await access.project(principal, key, hints);
      return (await present(project, [await resolveBoard(project, value)]))[0]!;
    },

    /** The short `/board/<slug>` route: the organisation from the session or token, the project from the board. */
    async getBySlug(principal: Principal, slug: string, hints: OrgHints = {}): Promise<Board> {
      const org = await access.current(principal, hints);
      const row = await boards.findBySlug(org.ctx, slug);
      const notFound = () => new AppError('board.slug_not_found', 404, { board: slug }, 'slug');
      if (!row) throw notFound();
      let project: ProjectAccess;
      try {
        project = await access.projectById(principal, org, row.project_id);
      } catch (err) {
        if (err instanceof AppError && err.code === 'project.not_found') throw notFound();
        throw err;
      }
      return (await present(project, [row]))[0]!;
    },

    async create(principal: Principal, key: string, input: CreateBoard, hints: OrgHints = {}): Promise<Board> {
      const project = await access.project(principal, key, hints);
      requireManage(principal, project);
      await checkName(project, input.name);
      const values = await valuesOf(project);
      const field = input.column_field ?? 'status';
      const columns = input.columns
        ? columnsFrom(project, input.columns, field, valuesFor(values, field))
        : field === 'status'
          ? seededColumns(values.statuses)
          : columnPerValue(valuesFor(values, field));
      const lanes = swimlanesFrom(
        project,
        values.types,
        input.swimlane_by ?? 'none',
        input.swimlane_field ?? null,
        input.swimlane_types,
        [],
      );
      checkLanesAgainstColumns(lanes.by, lanes.field, field);
      const slug = await slugFor(project, input.name);
      const at = now();
      const row = await withUniqueAs(
        () =>
          inTransaction(repos =>
            repos.boards.insert(
              project.ctx,
              {
                project_id: project.project.id,
                name: input.name,
                slug,
                column_field: field,
                swimlane_by: lanes.by,
                swimlane_field: lanes.field,
                created_by: principal.userId,
                created_at: at,
                updated_at: at,
              },
              columns,
              lanes.by === 'issues' ? lanes.typeIds : [],
            ),
          ),
        ['boards_project_lower_name_unique'],
        () => new AppError('board.name_taken', 409, { name: input.name, project: project.project.key }, 'name'),
      );
      deps.analytics.capture(
        'board_created',
        { via: principal.via, columns: columns.length, swimlane_by: lanes.by },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return (await present(project, [row]))[0]!;
    },

    async update(
      principal: Principal,
      key: string,
      value: string,
      input: UpdateBoard,
      hints: OrgHints = {},
    ): Promise<Board> {
      const project = await access.project(principal, key, hints);
      requireManage(principal, project);
      const current = await resolveBoard(project, value);
      const values = await valuesOf(project);
      const layout = (await boards.layout(project.ctx, [current.id])).get(current.id)!;
      const patch: Parameters<BoardsRepository['update']>[2] = { updated_at: now() };
      if (input.name !== undefined && input.name !== current.name) {
        await checkName(project, input.name, current.id);
        patch.name = input.name;
        if (!sameName(input.name, current.name)) patch.slug = await slugFor(project, input.name);
      }
      const field = input.column_field ?? (current.column_field as BoardColumnField);
      const refield = field !== current.column_field;
      if (refield) patch.column_field = field;
      const columns = input.columns
        ? columnsFrom(project, input.columns, field, valuesFor(values, field))
        : refield
          ? columnPerValue(valuesFor(values, field))
          : undefined;
      const touchesLanes =
        input.swimlane_by !== undefined || input.swimlane_field !== undefined || input.swimlane_types !== undefined;
      let typeIds: number[] | undefined;
      if (touchesLanes) {
        const lanes = swimlanesFrom(
          project,
          values.types,
          input.swimlane_by ?? (current.swimlane_by as BoardSwimlane),
          input.swimlane_field !== undefined ? input.swimlane_field : (current.swimlane_field as BoardSwimlaneField),
          input.swimlane_types,
          layout.swimlane_type_ids,
        );
        patch.swimlane_by = lanes.by;
        patch.swimlane_field = lanes.field;
        typeIds = lanes.by === 'issues' ? lanes.typeIds : [];
      }
      checkLanesAgainstColumns(
        (patch.swimlane_by ?? current.swimlane_by) as BoardSwimlane,
        (patch.swimlane_field !== undefined
          ? patch.swimlane_field
          : current.swimlane_field) as BoardSwimlaneField | null,
        field,
      );
      const row = await withUniqueAs(
        () =>
          inTransaction(repos =>
            repos.boards.update(project.ctx, current.id, patch, { columns, swimlaneTypeIds: typeIds }),
          ),
        ['boards_project_lower_name_unique'],
        () =>
          new AppError(
            'board.name_taken',
            409,
            { name: input.name ?? current.name, project: project.project.key },
            'name',
          ),
      );
      return (await present(project, [row!]))[0]!;
    },

    async remove(principal: Principal, key: string, value: string, hints: OrgHints = {}): Promise<Board> {
      const project = await access.project(principal, key, hints);
      requireManage(principal, project);
      const current = await resolveBoard(project, value);
      const before = (await present(project, [current]))[0]!;
      await boards.remove(project.ctx, current.id);
      return before;
    },

    /** The board on a sprint: filter-aware column counts, lanes, the distribution strip. */
    async view(
      principal: Principal,
      key: string,
      value: string,
      query: BoardViewQuery,
      hints: OrgHints = {},
    ): Promise<BoardView> {
      const sc = await search.context(principal, hints, key);
      const project = sc.project!;
      const row = await resolveBoard(project, value);
      const presented = await presentWith(project, [row]);
      const board = presented.boards[0]!;
      const layout = presented.layouts.get(row.id)!;
      const { values } = presented;
      const preloaded: CardsPreloaded = { catalogue: sc.catalogue, values };
      const wanted = query.sprint?.trim() || CURRENT_SPRINT;
      const sprintRow: SprintRow | null =
        wanted.toLowerCase() === CURRENT_SPRINT
          ? ((await deps.sprints.findActive(project.ctx, project.project.id)) ?? null)
          : await sprintsService.resolveSprint(project, wanted);
      const sprint = sprintRow
        ? (
            await sprintsService.present(
              principal,
              project,
              [sprintRow],
              sc.scope.today,
              new Map([[project.project.id, project.project]]),
            )
          )[0]!
        : null;

      const columnField = board.column_field;
      const by = query.swimlane_by ?? board.swimlane_by;
      const field = by === 'values' ? (query.swimlane_field ?? board.swimlane_field ?? 'assignee') : null;
      checkLanesAgainstColumns(by, field, columnField);
      const columnOf = new Map<number, string>();
      for (const c of layout.columns) for (const id of c.value_ids) columnOf.set(id, c.name);

      let placed: Placed[] = [];
      let filtered = new Map<number, number>();
      let byStatus = new Map<number, number>();
      let totals = new Map<number, number>();
      let matched = 0;
      if (sprintRow) {
        const container = { projectId: project.project.id, sprintId: sprintRow.id };
        const compiled = await search.compile(principal, sc, query.q);
        const counts = (f: BoardColumnField) =>
          issueSearch
            .valueCounts(sc.ctx, sc.scope, compiled.query, container, f)
            .then(rows => new Map(rows.map(c => [c.value_id, c.n])));
        const countsByColumn = counts(columnField);
        const [result, unfiltered, byColumn, statusCounts] = await Promise.all([
          search.search(principal, sc, { q: query.q, compiled, container, limit: BOARD_CARDS_MAX, offset: 0 }),
          deps.sprints.valueCounts(project.ctx, [sprintRow.id], columnField),
          countsByColumn,
          columnField === 'status' ? countsByColumn : counts('status'),
        ]);
        filtered = byColumn;
        byStatus = statusCounts;
        totals = new Map(unfiltered.map(c => [c.value_id, c.n]));
        matched = result.total;
        const rows = result.entries.map(e => e.row);
        const cards = await issuesService.boardCards(project, rows, preloaded);
        placed = rows.map((row, i) => ({ row, card: cards[i]! }));
      }
      const onBoard = placed.filter(p => columnOf.has(valueOf(p.row, columnField)));
      const sum = (counts: Map<number, number>, ids: number[]) => ids.reduce((n, id) => n + (counts.get(id) ?? 0), 0);

      const columns = board.columns.map((c, i) => {
        const ids = layout.columns[i]!.value_ids;
        const total = sum(totals, ids);
        return {
          ...c,
          count: sum(filtered, ids),
          total,
          over_wip_max: c.wip_max !== null && total > c.wip_max,
          under_wip_min: c.wip_min !== null && total < c.wip_min,
        };
      });

      const lanes = await lanesOf(
        project,
        by,
        field,
        layout,
        onBoard,
        board.columns.map(c => c.name),
        columnOf,
        columnField,
        preloaded,
      );

      if (sprintRow && (await dailyOnce(deps.redis, `board:${principal.userId}:${row.id}`, now()))) {
        deps.analytics.capture(
          'board_viewed',
          { via: principal.via, swimlane_by: by, filtered: Boolean(query.q?.trim()) },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }

      const mappedIds = new Set(columnOf.keys());
      return {
        board,
        sprint,
        columns,
        lanes,
        distribution: statusCountsOf(values.statuses, byStatus),
        unmapped: valueCountsOf(
          valuesFor(values, columnField).filter(v => !mappedIds.has(v.id)),
          filtered,
        ),
        truncated: matched > placed.length,
      };
    },
  };
}

export type BoardsService = ReturnType<typeof boardsService>;
