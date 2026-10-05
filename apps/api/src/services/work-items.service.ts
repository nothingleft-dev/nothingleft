import {
  WORK_ITEM_NOTE_MAX_BYTES,
  WORK_ITEM_RANGE_MAX_DAYS,
  type CreateWorkItems,
  type Pagination,
  type Principal,
  type UpdateWorkItem,
  type WorkItem,
  type WorkItemAttributeRef,
  type WorkItemAttributesInput,
  type WorkItemRecord,
  type WorkItemSnapshot,
} from '@nothingleft/types';
import type {
  IssuePerson,
  IssuesRepository,
  OrganizationsRepository,
  ProjectSchemaRepository,
  ProjectsRepository,
  WorkItemAttributeRow,
  WorkItemAttributeValueRow,
  WorkItemAttributesRepository,
  WorkItemListed,
  WorkItemPatch,
  WorkItemRow,
  WorkItemsRepository,
  WorkTypeRow,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import {
  calendarDaysBetween,
  formatIssueKey,
  parseDuration,
  workingDaysBetween,
  type WorkWeek,
} from '@nothingleft/format';
import { extractReferences, markdownByteLength } from '@nothingleft/markdown';
import { AppError } from '@lib/errors';
import type { AccessService, ProjectAccess } from '@services/access';
import { claimDrafts, releaseStorage } from '@services/attachment-writer';
import { refreshSpentRollup } from '@services/issue-hierarchy';
import { recordIssueEvent, type ChangeContext } from '@services/issue-history';
import type { IssuesService, Located } from '@services/issues.service';
import { can, projectRolesWith } from '@services/permissions';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface WorkItemsDeps {
  access: AccessService;
  issues: IssuesService;
  issuesRepo: IssuesRepository;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  schema: ProjectSchemaRepository;
  workItems: WorkItemsRepository;
  workItemAttributes: WorkItemAttributesRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

export interface WorkItemPageQuery {
  cursor?: string | undefined;
  limit: number;
  subtasks: boolean;
}

interface AttributeCatalogue {
  attributes: WorkItemAttributeRow[];
  values: WorkItemAttributeValueRow[];
}

interface AttributeChoice {
  attribute_id: number;
  value_id: number | null;
}

interface Author {
  id: number;
  username: string;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const encodeCursor = (row: WorkItemRow) =>
  Buffer.from(JSON.stringify({ d: row.work_date, id: row.id })).toString('base64url');

function decodeCursor(cursor: string): { work_date: string; id: number } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { d?: unknown; id?: unknown };
    if (
      typeof parsed.d === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.d) &&
      typeof parsed.id === 'number' &&
      Number.isInteger(parsed.id)
    ) {
      return { work_date: parsed.d, id: parsed.id };
    }
  } catch {
    // fall through to the catalogue error
  }
  throw new AppError('activity.invalid_cursor', 400, {}, 'cursor');
}

/** A range's rows, one per working day - the expansion itself is `workingDaysBetween`. */
export function workingDays(from: string, to: string, week: WorkWeek, field: string): string[] {
  if (from > to) throw new AppError('work_item.range_out_of_order', 400, {}, field);
  const span = calendarDaysBetween(from, to);
  if (span > WORK_ITEM_RANGE_MAX_DAYS) {
    throw new AppError('work_item.range_too_long', 400, { days: span, max: WORK_ITEM_RANGE_MAX_DAYS }, field);
  }
  const days = workingDaysBetween(from, to, week);
  if (days.length === 0) throw new AppError('work_item.range_no_working_days', 400, { from, to }, field);
  return days;
}

export function workItemsService(deps: WorkItemsDeps) {
  const { access, issues, issuesRepo, organizations, projects, schema, workItems, inTransaction, analytics } = deps;
  const attributeRepo = deps.workItemAttributes;

  async function attributeCatalogue(project: ProjectAccess): Promise<AttributeCatalogue> {
    const attributes = await attributeRepo.listForProjects(project.ctx, [project.project.id]);
    const values = await attributeRepo.listValues(
      project.ctx,
      attributes.map(a => a.id),
    );
    return { attributes, values };
  }

  /** `attributes` by name → value ids; an archived attribute or value is choosable only where it is already set. */
  function chooseAttributes(
    project: ProjectAccess,
    cat: AttributeCatalogue,
    input: WorkItemAttributesInput | undefined,
    held: readonly { attribute_id: number; value_id: number }[] = [],
  ): AttributeChoice[] {
    if (!input) return [];
    return Object.entries(input).map(([name, valueName]) => {
      const attribute = cat.attributes.find(a => sameName(a.name, name));
      const heldValue = held.find(h => h.attribute_id === attribute?.id)?.value_id;
      if (!attribute || (attribute.is_archived && heldValue === undefined)) {
        throw new AppError(
          'work_item_attribute.unknown',
          400,
          { attribute: name, project: project.project.key },
          'attributes',
          cat.attributes.filter(a => !a.is_archived).map(a => a.name),
        );
      }
      if (valueName === null) return { attribute_id: attribute.id, value_id: null };
      const choosable = cat.values.filter(
        v => v.attribute_id === attribute.id && (!v.is_archived || v.id === heldValue),
      );
      const value = choosable.find(v => sameName(v.name, valueName));
      if (!value) {
        throw new AppError(
          'work_item_attribute.unknown_value',
          400,
          { attribute: attribute.name, value: valueName },
          `attributes.${attribute.name}`,
          choosable.map(v => v.name),
        );
      }
      return { attribute_id: attribute.id, value_id: value.id };
    });
  }

  function attributeRefs(
    cat: AttributeCatalogue,
    held: readonly { attribute_id: number; value_id: number }[],
  ): WorkItemAttributeRef[] {
    return cat.attributes.flatMap(attribute => {
      const value = cat.values.find(v => v.id === held.find(h => h.attribute_id === attribute.id)?.value_id);
      return value ? [{ attribute: attribute.name, value: { name: value.name, short_label: value.short_label } }] : [];
    });
  }

  const attributeSnapshot = (refs: WorkItemAttributeRef[]) =>
    refs.length === 0 ? {} : { attributes: Object.fromEntries(refs.map(r => [r.attribute, r.value.name])) };

  const applyChoices = (held: readonly { attribute_id: number; value_id: number }[], choices: AttributeChoice[]) => [
    ...held.filter(h => !choices.some(c => c.attribute_id === h.attribute_id)),
    ...choices.flatMap(c => (c.value_id === null ? [] : [{ attribute_id: c.attribute_id, value_id: c.value_id }])),
  ];
  const now = deps.now ?? (() => new Date());

  const keyOf = ({ project, issue }: Located) => issues.keyIn(project)(issue);
  const notFound = (located: Located, id: number) =>
    new AppError('work_item.not_found', 404, { id, key: keyOf(located) }, 'id');

  function requireWritable(located: Located) {
    const { project } = located.project;
    if (project.is_archived) throw new AppError('project.archived', 409, { key: project.key });
    if (!project.time_tracking_enabled) throw new AppError('time_tracking.disabled', 409, { key: project.key });
  }

  function minutesOf(project: ProjectAccess, value: number | string, field: string): number {
    if (typeof value === 'number') return value;
    const minutes = parseDuration(value, {
      workdayMinutes: project.organization.workday_minutes,
      workweekDays: project.organization.workweek_days,
    });
    if (minutes === null || minutes <= 0) throw new AppError('work_item.invalid_duration', 400, { value }, field);
    return minutes;
  }

  function checkNote(note: string) {
    const bytes = markdownByteLength(note);
    if (bytes > WORK_ITEM_NOTE_MAX_BYTES) {
      throw new AppError(
        'work_item.note_too_large',
        400,
        { size: Math.ceil(bytes / 1024), max: WORK_ITEM_NOTE_MAX_BYTES / 1024 },
        'description_md',
      );
    }
  }

  async function workTypeFor(
    project: ProjectAccess,
    name: string | null | undefined,
    currentId?: number | null,
  ): Promise<WorkTypeRow | null | undefined> {
    if (name === undefined) return undefined;
    if (name === null) return null;
    const rows = await schema.list(project.ctx, 'work_types', project.project.id);
    // An archived work type stays on the records that have it but cannot be newly chosen.
    const choosable = rows.filter(r => r.id === currentId || !r.is_archived);
    const row = choosable.find(r => sameName(r.name, name));
    if (!row) {
      throw new AppError(
        'work_item.unknown_work_type',
        400,
        { work_type: name, project: project.project.key },
        'work_type',
        choosable.map(r => r.name),
      );
    }
    return row;
  }

  async function defaultWorkType(project: ProjectAccess): Promise<WorkTypeRow | null> {
    const rows = await schema.list(project.ctx, 'work_types', project.project.id);
    return rows.find(r => r.is_default && !r.is_archived) ?? null;
  }

  /** Someone who could log their own time here; naming anyone but yourself needs the on-behalf cell. */
  async function authorFor(principal: Principal, located: Located, username: string | undefined): Promise<Author> {
    const { project } = located;
    const name = username?.replace(/^@/, '');
    const self = project.membership;
    if (name === undefined || sameName(name, self.username)) {
      access.require(principal, 'work_item.log_own', project.scope);
      return { id: principal.userId, username: self.username };
    }
    access.require(principal, 'work_item.log_for_other', project.scope);
    const [found] = await organizations.findMembersByUsernames(project.ctx, [name]);
    const eligible = found
      ? await projects.listAssignable(project.ctx, project.project.id, {
          userIds: [found.user.id],
          roles: projectRolesWith('work_item.log_own'),
        })
      : [];
    if (!found || eligible.length === 0) {
      throw new AppError(
        'work_item.unknown_author',
        400,
        { username: `@${name}`, project: project.project.key },
        'author',
      );
    }
    return { id: found.user.id, username: found.membership.username };
  }

  function datesOf(located: Located, record: WorkItemRecord, index: number): string[] {
    if ('work_date' in record) return [record.work_date];
    const { organization } = located.project;
    return workingDays(
      record.from,
      record.to,
      { workweekDays: organization.workweek_days, weekStartsOn: organization.week_starts_on },
      `records.${index}.from`,
    );
  }

  async function writeMentions(repos: TenantRepos, located: Located, item: WorkItemRow, note: string | null) {
    const usernames = note ? extractReferences(note).mentions : [];
    const found = await repos.organizations.findMembersByUsernames(located.project.ctx, usernames);
    await repos.issues.replaceMentions(
      located.project.ctx,
      { type: 'work_item', id: item.id, issueId: item.issue_id },
      found.map(f => f.user.id),
    );
  }

  const snapshot = (
    row: WorkItemRow,
    author: string,
    workType: string | null,
    attributes: WorkItemAttributeRef[] = [],
  ): WorkItemSnapshot => ({
    work_item_id: row.id,
    author,
    work_date: row.work_date,
    minutes: row.duration_minutes,
    work_type: workType,
    ...attributeSnapshot(attributes),
  });

  async function usernameOf(located: Located, userId: number): Promise<string> {
    if (userId === located.project.membership.user_id) return located.project.membership.username;
    const [person] = await issuesRepo.findPeople(located.project.ctx, [userId]);
    return person?.membership?.username ?? '';
  }

  async function lockedIssue(repos: TenantRepos, located: Located) {
    const issue = await repos.issues.lockById(located.project.ctx, located.issue.id);
    if (!issue || issue.deleted_at) throw new AppError('issue.not_found', 404, { key: keyOf(located) }, 'key');
    return issue;
  }

  async function dtos(principal: Principal, located: Located, rows: WorkItemListed[]): Promise<WorkItem[]> {
    const { project } = located;
    const people = await issuesRepo.findPeople(
      project.ctx,
      rows.flatMap(r => [r.item.author_id, r.item.created_by]),
    );
    const byId = new Map(people.map(p => [p.user.id, p]));
    const [cat, held] = await Promise.all([
      attributeCatalogue(project),
      attributeRepo.valuesForWorkItems(
        project.ctx,
        rows.map(r => r.item.id),
      ),
    ]);
    const ref = (id: number) => {
      const person: IssuePerson | undefined = byId.get(id);
      return person
        ? access.memberRef(person.user, person.membership)
        : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false };
    };
    const writable = !project.project.is_archived && project.project.time_tracking_enabled;
    return rows.map(({ item, issue_key_number, work_type }) => {
      const scope = { ...project.scope, isOwnRecord: item.author_id === principal.userId };
      return {
        id: item.id,
        issue: formatIssueKey(project.project.key, issue_key_number),
        author: ref(item.author_id),
        created_by: ref(item.created_by),
        work_date: item.work_date,
        duration_minutes: item.duration_minutes,
        work_type: work_type ? { name: work_type.name, short_label: work_type.short_label } : null,
        attributes: attributeRefs(
          cat,
          held.filter(h => h.work_item_id === item.id),
        ),
        description_md: item.description_md,
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        me: {
          can_edit: writable && can(principal, 'work_item.update', scope),
          can_delete: writable && can(principal, 'work_item.delete', scope),
        },
      };
    });
  }

  async function findItem(located: Located, id: number): Promise<WorkItemListed> {
    const row = await workItems.findOnIssue(located.project.ctx, located.issue.id, id);
    if (!row) throw notFound(located, id);
    return row;
  }

  function requireOwnOrAbove(
    principal: Principal,
    located: Located,
    row: WorkItemListed,
    capability: 'work_item.update' | 'work_item.delete',
  ) {
    const scope = { ...located.project.scope, isOwnRecord: row.item.author_id === principal.userId };
    access.require(principal, capability, scope);
    requireWritable(located);
  }

  const change = (located: Located, actorId: number, at: Date): ChangeContext => ({
    ctx: located.project.ctx,
    issueId: located.issue.id,
    actorId,
    changeGroupId: Bun.randomUUIDv7(),
    at,
  });

  return {
    async list(
      principal: Principal,
      key: string,
      query: WorkItemPageQuery,
      hints: OrgHints = {},
    ): Promise<{ data: WorkItem[]; pagination: Pagination }> {
      const located = await issues.locate(principal, key, hints);
      access.require(principal, 'work_item.read', located.project.scope);
      const ctx = located.project.ctx;
      const issueIds = query.subtasks ? await issuesRepo.liveSubtreeIds(ctx, located.issue.id) : [located.issue.id];
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const [rows, total] = await Promise.all([
        workItems.list(ctx, issueIds, { after, limit: query.limit + 1 }),
        workItems.count(ctx, issueIds),
      ]);
      const page = rows.slice(0, query.limit);
      const has_more = rows.length > query.limit;
      return {
        data: await dtos(principal, located, page),
        pagination: {
          total,
          limit: query.limit,
          offset: 0,
          next_cursor: has_more ? encodeCursor(page.at(-1)!.item) : null,
          has_more,
        },
      };
    },

    async get(principal: Principal, key: string, id: number, hints: OrgHints = {}): Promise<WorkItem> {
      const located = await issues.locate(principal, key, hints);
      access.require(principal, 'work_item.read', located.project.scope);
      return (await dtos(principal, located, [await findItem(located, id)]))[0]!;
    },

    /** Every record, and every working day of a range, becomes its own row; one save, one change group. */
    async create(principal: Principal, key: string, input: CreateWorkItems, hints: OrgHints = {}): Promise<WorkItem[]> {
      const located = await issues.locate(principal, key, hints);
      const author = await authorFor(principal, located, input.author);
      requireWritable(located);
      if (input.attachment_ids?.length) access.require(principal, 'attachment.upload', located.project.scope);
      const note = input.description_md ?? '';
      checkNote(note);
      const planned = input.records.flatMap((record, index) => {
        const minutes = minutesOf(located.project, record.duration, `records.${index}.duration`);
        return datesOf(located, record, index).map(work_date => ({ work_date, minutes }));
      });
      const workType =
        input.work_type === undefined
          ? await defaultWorkType(located.project)
          : await workTypeFor(located.project, input.work_type);
      const attributeCat = await attributeCatalogue(located.project);
      const choices = chooseAttributes(located.project, attributeCat, input.attributes);
      const chosenRefs = attributeRefs(attributeCat, applyChoices([], choices));

      const created = await inTransaction(async repos => {
        const ctx = located.project.ctx;
        await lockedIssue(repos, located);
        const at = now();
        const rows = await repos.workItems.insertMany(
          ctx,
          planned.map(p => ({
            issue_id: located.issue.id,
            author_id: author.id,
            created_by: principal.userId,
            work_date: p.work_date,
            duration_minutes: p.minutes,
            work_type_id: workType?.id ?? null,
            description_md: note,
            created_at: at,
            updated_at: at,
          })),
        );
        await repos.workItemAttributes.setValues(
          ctx,
          rows.map(r => r.id),
          choices,
        );
        // As with a comment: the issue's updated time moves, its "Updated by" does not.
        await repos.issues.update(ctx, located.issue.id, { updated_at: at });
        await refreshSpentRollup(repos, ctx, [located.issue.id]);
        const group = change(located, principal.userId, at);
        for (const row of rows) {
          await writeMentions(repos, located, row, note);
          await recordIssueEvent(repos.issueActivity, group, 'time_logged', {
            new_value: snapshot(row, author.username, workType?.name ?? null, chosenRefs),
          });
        }
        await claimDrafts(repos, { change: group, key: keyOf(located), workItemId: rows[0]!.id }, input.attachment_ids);
        return rows;
      });

      analytics.capture(
        'time_logged',
        {
          via: principal.via,
          record_count: input.records.length,
          row_count: created.length,
          ranged: input.records.some(r => 'from' in r),
          on_behalf: author.id !== principal.userId,
        },
        { userId: principal.userId, orgId: located.project.organization.id },
      );
      return dtos(
        principal,
        located,
        await workItems.findMany(
          located.project.ctx,
          created.map(r => r.id),
        ),
      );
    },

    async update(
      principal: Principal,
      key: string,
      id: number,
      input: UpdateWorkItem,
      hints: OrgHints = {},
    ): Promise<WorkItem> {
      const located = await issues.locate(principal, key, hints);
      const found = await findItem(located, id);
      requireOwnOrAbove(principal, located, found, 'work_item.update');
      const author = input.author === undefined ? undefined : await authorFor(principal, located, input.author);
      if (input.description_md !== undefined) checkNote(input.description_md);
      const minutes = input.duration === undefined ? undefined : minutesOf(located.project, input.duration, 'duration');
      const workType = await workTypeFor(located.project, input.work_type, found.item.work_type_id);
      const attributeCat = await attributeCatalogue(located.project);
      const heldBefore = await attributeRepo.valuesForWorkItems(located.project.ctx, [id]);
      const choices = chooseAttributes(located.project, attributeCat, input.attributes, heldBefore);

      await inTransaction(async repos => {
        const ctx = located.project.ctx;
        await lockedIssue(repos, located);
        const current = await repos.workItems.lockOnIssue(ctx, located.issue.id, id);
        if (!current) throw notFound(located, id);
        const patch: WorkItemPatch = {};
        if (author && author.id !== current.author_id) patch.author_id = author.id;
        if (input.work_date !== undefined && input.work_date !== current.work_date) patch.work_date = input.work_date;
        if (minutes !== undefined && minutes !== current.duration_minutes) patch.duration_minutes = minutes;
        if (workType !== undefined && (workType?.id ?? null) !== current.work_type_id) {
          patch.work_type_id = workType?.id ?? null;
        }
        if (input.description_md !== undefined && input.description_md !== current.description_md) {
          patch.description_md = input.description_md;
        }
        const held = await repos.workItemAttributes.valuesForWorkItems(ctx, [id]);
        const before = attributeRefs(attributeCat, held);
        const after = attributeRefs(attributeCat, applyChoices(held, choices));
        const attributesChanged = JSON.stringify(before) !== JSON.stringify(after);
        if (Object.keys(patch).length === 0 && !attributesChanged) return;
        const at = now();
        if (attributesChanged) await repos.workItemAttributes.setValues(ctx, [id], choices);
        const updated = (await repos.workItems.update(ctx, id, { ...patch, updated_at: at }))!;
        if (patch.description_md !== undefined) await writeMentions(repos, located, updated, patch.description_md);
        if (patch.duration_minutes !== undefined) await refreshSpentRollup(repos, ctx, [located.issue.id]);
        const typeName = (typeId: number | null) =>
          typeId === current.work_type_id ? (found.work_type?.name ?? null) : (workType?.name ?? null);
        await recordIssueEvent(repos.issueActivity, change(located, principal.userId, at), 'time_logged', {
          old_value: snapshot(
            current,
            await usernameOf(located, current.author_id),
            typeName(current.work_type_id),
            before,
          ),
          new_value: snapshot(
            updated,
            author?.username ?? (await usernameOf(located, updated.author_id)),
            typeName(updated.work_type_id),
            after,
          ),
        });
      });
      return (await dtos(principal, located, [await findItem(located, id)]))[0]!;
    },

    async remove(principal: Principal, key: string, id: number, hints: OrgHints = {}): Promise<WorkItem> {
      const located = await issues.locate(principal, key, hints);
      const found = await findItem(located, id);
      requireOwnOrAbove(principal, located, found, 'work_item.delete');
      const [dto] = await dtos(principal, located, [found]);
      await inTransaction(async repos => {
        const ctx = located.project.ctx;
        await lockedIssue(repos, located);
        const current = await repos.workItems.lockOnIssue(ctx, located.issue.id, id);
        if (!current) throw notFound(located, id);
        const at = now();
        // Before the delete: its foreign key would cascade the rows away and strand their objects.
        const files = await repos.attachments.detachFromWorkItems(ctx, [id], at);
        await releaseStorage(repos, ctx, files, access.storageLimit);
        await repos.workItems.delete(ctx, id);
        await writeMentions(repos, located, current, null);
        await refreshSpentRollup(repos, ctx, [located.issue.id]);
        await recordIssueEvent(repos.issueActivity, change(located, principal.userId, at), 'time_logged', {
          old_value: snapshot(current, dto!.author.username, found.work_type?.name ?? null, dto!.attributes),
        });
      });
      return dto!;
    },
  };
}

export type WorkItemsService = ReturnType<typeof workItemsService>;
