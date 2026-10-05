import { and, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { parseDuration, parseIssueKey, slugify, type WorkCalendar } from '@nothingleft/format';
import {
  dateInZone,
  ISSUE_LINKS,
  resolveDatePeriod,
  type Bound,
  type Clause,
  type DateValue,
  type Query,
  type SortKey,
  type Value,
  type Weekday,
} from '@nothingleft/query';
import { RESOLVED_STATUS_CATEGORIES, type CustomFieldKind } from '@nothingleft/types';
import { issues } from '../schema/index.ts';

/**
 * An issue's Estimation in minutes: its project's chosen duration field, else the built-in column.
 * `issue` is the alias the surrounding statement gives `issues`.
 */
export function effectiveEstimate(orgId: number, issue: string): SQL {
  const i = sql.identifier(issue);
  return sql`(select case when ep.estimation_field_id is null then ${i}.estimate_minutes::double precision else (select ev.value_number from issue_field_values ev where ev.org_id = ${orgId} and ev.issue_id = ${i}.id and ev.field_id = ep.estimation_field_id) end from projects ep where ep.id = ${i}.project_id)`;
}

/** A custom field slug as the compiler sees it; one slug has one kind across the organisation. */
export interface CustomFieldScope {
  slug: string;
  kind: CustomFieldKind;
  /** Projects whose Spent time is this field: its value there is the rollup, not stored rows. */
  spentTimeProjectIds: readonly number[];
}

/** Everything the compiler needs besides the AST. `projectIds` is the caller's readable scope. */
export interface IssueSearchScope {
  orgId: number;
  userId: number;
  projectIds: readonly number[];
  timezone: string;
  /** Today's calendar date in `timezone`. */
  today: string;
  weekStartsOn: Weekday;
  now: Date;
  calendar: WorkCalendar;
  customFields?: readonly CustomFieldScope[];
}

type IssueTable = typeof issues;

const TRUE = sql`true`;
const FALSE = sql`false`;
const MAX_DEPTH = 8;

const resolvedCategories = sql.join(
  RESOLVED_STATUS_CATEGORIES.map(c => sql`${c}`),
  sql`, `,
);

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, c => `\\${c}`)}%`;

function preciseInstant(value: DateValue, now: Date): Date | null {
  if (value.kind === 'keyword' && value.keyword === 'now') return now;
  if (value.kind === 'relative' && (value.unit === 'm' || value.unit === 'h')) {
    const ms = value.amount * (value.unit === 'm' ? 60_000 : 3_600_000);
    return new Date(now.getTime() + value.sign * ms);
  }
  return null;
}

/** A calendar-day period for a date value; a sub-day value lands on its day in the user's timezone. */
function dayPeriod(value: DateValue, scope: IssueSearchScope) {
  const instant = preciseInstant(value, scope.now);
  if (instant) {
    const day = dateInZone(instant, scope.timezone);
    return { start: day, end: day };
  }
  return resolveDatePeriod(value, { today: scope.today, weekStartsOn: scope.weekStartsOn })!;
}

function isDate(bound: Bound): bound is DateValue {
  return bound.kind !== 'number' && bound.kind !== 'duration';
}

export function issueSearch(scope: IssueSearchScope) {
  const { orgId, userId } = scope;
  const tz = scope.timezone;

  const startOfDay = (day: string) => sql`((${day})::date::timestamp at time zone ${tz})`;
  const endOfDay = (day: string) => sql`(((${day})::date + 1)::timestamp at time zone ${tz})`;

  const userId$ = (username: string) =>
    sql`(select m.user_id from org_members m where m.org_id = ${orgId} and lower(m.username) = lower(${username.replace(/^@/, '')}))`;

  const inScope = (t: IssueTable): SQL =>
    scope.projectIds.length === 0
      ? FALSE
      : sql`${t.org_id} = ${orgId} and ${t.deleted_at} is null and ${t.project_id} in (${sql.join(
          scope.projectIds.map(id => sql`${id}`),
          sql`, `,
        )})`;

  function valueList(values: Value[], match: (value: Value) => SQL): SQL {
    const positive = values.filter(v => !v.negated).map(match);
    // coalesce: `due date: -Today` must keep issues with no due date, where the comparison is NULL.
    const negative = values.filter(v => v.negated).map(v => sql`not coalesce(${match(v)}, false)`);
    return and(positive.length > 0 ? or(...positive) : undefined, ...negative) ?? TRUE;
  }

  function instantRange(column: SQL, value: Value): SQL {
    const lower = (bound: Bound) => {
      if (!isDate(bound)) return FALSE;
      const precise = preciseInstant(bound, scope.now);
      return precise
        ? sql`${column} >= ${precise.toISOString()}`
        : sql`${column} >= ${startOfDay(dayPeriod(bound, scope).start)}`;
    };
    const upper = (bound: Bound) => {
      if (!isDate(bound)) return FALSE;
      const precise = preciseInstant(bound, scope.now);
      return precise
        ? sql`${column} <= ${precise.toISOString()}`
        : sql`${column} < ${endOfDay(dayPeriod(bound, scope).end)}`;
    };
    if (value.kind === 'range') {
      return and(value.from ? lower(value.from) : undefined, value.to ? upper(value.to) : undefined) ?? TRUE;
    }
    const bound = value as Bound;
    if (!isDate(bound)) return FALSE;
    const precise = preciseInstant(bound, scope.now);
    // A sub-day offset on its own reads as "since then".
    if (precise) return sql`${column} >= ${precise.toISOString()}`;
    return and(lower(bound), upper(bound))!;
  }

  function dateRange(column: SQL, value: Value): SQL {
    const lower = (bound: Bound) => (isDate(bound) ? sql`${column} >= ${dayPeriod(bound, scope).start}` : FALSE);
    const upper = (bound: Bound) => (isDate(bound) ? sql`${column} <= ${dayPeriod(bound, scope).end}` : FALSE);
    if (value.kind === 'range') {
      return and(value.from ? lower(value.from) : undefined, value.to ? upper(value.to) : undefined) ?? TRUE;
    }
    const bound = value as Bound;
    return and(lower(bound), upper(bound))!;
  }

  function numberRange(column: SQL, value: Value, toNumber: (b: Bound) => number | null): SQL {
    const n = (b: Bound) => toNumber(b);
    if (value.kind === 'range') {
      const from = value.from ? n(value.from) : null;
      const to = value.to ? n(value.to) : null;
      if ((value.from && from === null) || (value.to && to === null)) return FALSE;
      return (
        and(from === null ? undefined : sql`${column} >= ${from}`, to === null ? undefined : sql`${column} <= ${to}`) ??
        TRUE
      );
    }
    const exact = n(value as Bound);
    return exact === null ? FALSE : sql`${column} = ${exact}`;
  }

  const minutes = (b: Bound) => (b.kind === 'duration' ? parseDuration(b.raw, scope.calendar) : null);
  const number = (b: Bound) => (b.kind === 'number' ? b.value : null);

  const byName = (table: string, idColumn: SQL, name: string) =>
    sql`${idColumn} in (select x.id from ${sql.raw(table)} x where x.org_id = ${orgId} and lower(x.name) = lower(${name}))`;

  const statusIn = (t: IssueTable, category: 'resolved' | 'unresolved') =>
    sql`${t.status_id} in (select s.id from workflow_statuses s where s.org_id = ${orgId} and s.category ${
      category === 'resolved' ? sql`in` : sql`not in`
    } (${resolvedCategories}))`;

  const hasAssignee = (t: IssueTable) =>
    sql`exists (select 1 from issue_assignees a where a.issue_id = ${t.id} and a.org_id = ${orgId})`;
  const assigneeIs = (t: IssueTable, user: SQL) =>
    sql`exists (select 1 from issue_assignees a where a.issue_id = ${t.id} and a.org_id = ${orgId} and a.user_id = ${user})`;
  const liveComments = (t: IssueTable, extra: SQL) =>
    sql`exists (select 1 from comments c where c.issue_id = ${t.id} and c.org_id = ${orgId} and c.deleted_at is null and ${extra})`;
  const workItems = (t: IssueTable, extra: SQL) =>
    sql`exists (select 1 from work_items w where w.issue_id = ${t.id} and w.org_id = ${orgId} and ${extra})`;
  const tagged = (t: IssueTable, extra: SQL) =>
    sql`exists (select 1 from issue_tags it join tags tg on tg.id = it.tag_id and tg.org_id = it.org_id where it.issue_id = ${t.id} and it.org_id = ${orgId} and ${extra})`;
  const attached = (t: IssueTable, extra: SQL) =>
    sql`exists (select 1 from attachments f where f.issue_id = ${t.id} and f.org_id = ${orgId} and f.deleted_at is null and ${extra})`;

  const tagMatch = (name: string) => sql`(lower(tg.name) = lower(${name}) or tg.slug = ${slugify(name)})`;
  const projectMatch = (t: IssueTable, name: string) =>
    sql`${t.project_id} in (select p.id from projects p where p.org_id = ${orgId} and (lower(p.key) = lower(${name}) or lower(p.name) = lower(${name})))`;

  // A sprint by name or slug, in any of the caller's projects: `sprint: {Sprint 14}` spans them.
  const sprintMatch = (t: IssueTable, name: string) =>
    sql`${t.sprint_id} in (select sp.id from sprints sp where sp.org_id = ${orgId} and (lower(sp.name) = lower(${name}) or sp.slug = lower(${name})))`;

  const customBySlug = new Map((scope.customFields ?? []).map(f => [f.slug, f]));

  // A field's rows count only where it applies to the issue's type (a value kept across a type change is hidden).
  const applies = (t: IssueTable) =>
    sql`(not exists (select 1 from custom_field_applies_to ca where ca.field_id = f.id and ca.org_id = ${orgId}) or exists (select 1 from custom_field_applies_to ca where ca.field_id = f.id and ca.org_id = ${orgId} and ca.type_id = ${t.type_id}))`;
  const fieldRows = (t: IssueTable, slug: string, extra: SQL) =>
    sql`exists (select 1 from issue_field_values v join custom_fields f on f.id = v.field_id and f.org_id = v.org_id where v.issue_id = ${t.id} and v.org_id = ${orgId} and f.slug = ${slug} and ${applies(t)} and ${extra})`;
  const fieldAggregate = (t: IssueTable, slug: string, expression: SQL, join: SQL = sql``) =>
    sql`(select ${expression} from issue_field_values v join custom_fields f on f.id = v.field_id and f.org_id = v.org_id ${join} where v.issue_id = ${t.id} and v.org_id = ${orgId} and f.slug = ${slug} and ${applies(t)})`;

  const estimate = (t: IssueTable) =>
    sql`(select case when ep.estimation_field_id is null then ${t.estimate_minutes}::double precision else (select ev.value_number from issue_field_values ev where ev.org_id = ${orgId} and ev.issue_id = ${t.id} and ev.field_id = ep.estimation_field_id) end from projects ep where ep.id = ${t.project_id})`;

  const personOf = (value: Value): SQL =>
    value.kind === 'me' ? sql`${userId}` : userId$((value as { value: string }).value);

  function keyMatch(t: IssueTable, key: string): SQL {
    const parsed = parseIssueKey(key);
    if (!parsed) return FALSE;
    return sql`(${t.key_number} = ${parsed.number} and ${t.project_id} in (select p.id from projects p where p.org_id = ${orgId} and lower(p.key) = lower(${parsed.projectKey})))`;
  }

  function hasValue(t: IssueTable, name: string): SQL {
    switch (name) {
      case 'description':
        return sql`coalesce(btrim(${t.description_md}), '') <> ''`;
      case 'attachments':
        return attached(t, TRUE);
      case 'comments':
      case 'commenter':
      case 'commented':
        return liveComments(t, TRUE);
      case 'assignee':
        return hasAssignee(t);
      case 'estimation':
        return sql`${estimate(t)} is not null`;
      case 'spent time':
        return sql`${t.spent_minutes} > 0`;
      case 'story points':
        return sql`${t.story_points} is not null`;
      case 'votes':
        return sql`${t.vote_count} > 0`;
      case 'due date':
        return sql`${t.due_date} is not null`;
      case 'start date':
        return sql`${t.start_date} is not null`;
      case 'resolved date':
        return sql`${t.resolved_at} is not null`;
      case 'tag':
        return tagged(t, TRUE);
      case 'work author':
        return workItems(t, TRUE);
      case 'work type':
        return workItems(t, sql`w.work_type_id is not null`);
      case 'sprint':
        return sql`${t.sprint_id} is not null`;
      default: {
        const field = customBySlug.get(name);
        return field ? customHas(t, field) : TRUE;
      }
    }
  }

  const inProjects = (t: IssueTable, ids: readonly number[]) =>
    ids.length === 0
      ? FALSE
      : sql`${t.project_id} in (${sql.join(
          ids.map(id => sql`${id}`),
          sql`, `,
        )})`;

  /** Where the field is a project's Spent time, the rollup answers; elsewhere its stored rows do. */
  function spentOr(t: IssueTable, field: CustomFieldScope, rollup: SQL, stored: SQL): SQL {
    if (field.spentTimeProjectIds.length === 0) return stored;
    const spent = inProjects(t, field.spentTimeProjectIds);
    return sql`((${spent} and ${rollup}) or (not ${spent} and ${stored}))`;
  }

  function customHas(t: IssueTable, field: CustomFieldScope): SQL {
    return spentOr(t, field, sql`${t.spent_minutes} > 0`, fieldRows(t, field.slug, TRUE));
  }

  function customMatch(t: IssueTable, field: CustomFieldScope, value: Value): SQL {
    const literal = (value as { value: string }).value;
    if (value.kind === 'empty') return sql`not ${customHas(t, field)}`;
    const rows = (extra: SQL) => fieldRows(t, field.slug, extra);
    switch (field.kind) {
      case 'text':
        return rows(sql`v.value_text ilike ${likePattern(literal)}`);
      case 'number':
        return rows(numberRange(sql`v.value_number`, value, number));
      case 'duration':
        return spentOr(
          t,
          field,
          numberRange(sql`${t.spent_minutes}`, value, minutes),
          rows(numberRange(sql`v.value_number`, value, minutes)),
        );
      case 'date':
        return rows(dateRange(sql`v.value_date`, value));
      case 'datetime':
        return rows(instantRange(sql`v.value_timestamptz`, value));
      case 'checkbox':
        return literal === 'yes' ? rows(sql`v.value_bool`) : sql`not ${rows(sql`v.value_bool`)}`;
      case 'option':
        return rows(
          sql`v.option_id in (select o.id from custom_field_options o where o.org_id = ${orgId} and o.field_id = f.id and lower(o.name) = lower(${literal}))`,
        );
      case 'person':
        return rows(sql`v.user_id = ${personOf(value)}`);
    }
  }

  function customSort(t: IssueTable, field: CustomFieldScope): SQL[] {
    const aggregate = (expression: SQL, join?: SQL) => fieldAggregate(t, field.slug, expression, join);
    switch (field.kind) {
      case 'number':
        return [aggregate(sql`min(v.value_number)`)];
      case 'duration': {
        const stored = aggregate(sql`min(v.value_number)`);
        if (field.spentTimeProjectIds.length === 0) return [stored];
        return [
          sql`case when ${inProjects(t, field.spentTimeProjectIds)} then nullif(${t.spent_minutes}, 0)::double precision else ${stored} end`,
        ];
      }
      case 'date':
        return [aggregate(sql`min(v.value_date)`)];
      case 'datetime':
        return [aggregate(sql`min(v.value_timestamptz)`)];
      case 'checkbox':
        return [aggregate(sql`bool_or(v.value_bool)`)];
      case 'option':
        return [
          aggregate(
            sql`min(o.position)`,
            sql`join custom_field_options o on o.id = v.option_id and o.org_id = v.org_id`,
          ),
        ];
      case 'person':
        return [
          aggregate(
            sql`min(lower(m.username))`,
            sql`join org_members m on m.org_id = v.org_id and m.user_id = v.user_id`,
          ),
        ];
      case 'text':
        return [];
    }
  }

  function attribute(t: IssueTable, name: string, values: Value[]): SQL {
    const literal = (v: Value) => (v as { value: string }).value;
    switch (name) {
      case 'project':
        return valueList(values, v => projectMatch(t, literal(v)));
      case 'status':
        return valueList(values, v =>
          v.kind === 'category'
            ? statusIn(t, v.category)
            : byName('workflow_statuses', sql`${t.status_id}`, literal(v)),
        );
      case 'priority':
        return valueList(values, v => byName('priorities', sql`${t.priority_id}`, literal(v)));
      case 'type':
        return valueList(values, v => byName('issue_types', sql`${t.type_id}`, literal(v)));
      case 'assignee':
        return valueList(values, v => (v.kind === 'empty' ? sql`not ${hasAssignee(t)}` : assigneeIs(t, personOf(v))));
      case 'created by':
        return valueList(values, v => sql`${t.created_by} = ${personOf(v)}`);
      case 'updated by':
        return valueList(values, v => sql`${t.updated_by} = ${personOf(v)}`);
      case 'commenter':
        return valueList(values, v => liveComments(t, sql`c.author_id = ${personOf(v)}`));
      case 'commented':
        return valueList(values, v => liveComments(t, instantRange(sql`c.created_at`, v)));
      case 'comments':
        return valueList(values, v => liveComments(t, sql`c.body_md ilike ${likePattern(literal(v))}`));
      case 'attachments':
        return valueList(values, v => attached(t, sql`f.filename ilike ${likePattern(literal(v))}`));
      case 'created':
        return valueList(values, v => instantRange(sql`${t.created_at}`, v));
      case 'updated':
        return valueList(values, v => instantRange(sql`${t.updated_at}`, v));
      case 'resolved date':
        return valueList(values, v =>
          v.kind === 'empty' ? sql`${t.resolved_at} is null` : instantRange(sql`${t.resolved_at}`, v),
        );
      case 'due date':
        return valueList(values, v =>
          v.kind === 'empty' ? sql`${t.due_date} is null` : dateRange(sql`${t.due_date}`, v),
        );
      case 'start date':
        return valueList(values, v =>
          v.kind === 'empty' ? sql`${t.start_date} is null` : dateRange(sql`${t.start_date}`, v),
        );
      case 'sprint':
        return valueList(values, v => (v.kind === 'empty' ? sql`${t.sprint_id} is null` : sprintMatch(t, literal(v))));
      case 'tag':
        return valueList(values, v => tagged(t, tagMatch(literal(v))));
      case 'work author':
        return valueList(values, v => workItems(t, sql`w.author_id = ${personOf(v)}`));
      case 'work type':
        return valueList(values, v =>
          workItems(
            t,
            sql`w.work_type_id in (select wt.id from work_types wt where wt.org_id = ${orgId} and lower(wt.name) = lower(${literal(v)}))`,
          ),
        );
      case 'spent time':
        return valueList(values, v =>
          v.kind === 'empty' ? sql`${t.spent_minutes} = 0` : numberRange(sql`${t.spent_minutes}`, v, minutes),
        );
      case 'estimation':
        return valueList(values, v =>
          v.kind === 'empty' ? sql`${estimate(t)} is null` : numberRange(estimate(t), v, minutes),
        );
      case 'story points':
        return valueList(values, v =>
          v.kind === 'empty' ? sql`${t.story_points} is null` : numberRange(sql`${t.story_points}`, v, number),
        );
      case 'votes':
        return valueList(values, v => numberRange(sql`${t.vote_count}`, v, number));
      case 'key':
        return valueList(values, v => (v.kind === 'key' ? keyMatch(t, v.key) : FALSE));
      case 'has':
        return valueList(values, v => (v.kind === 'attribute' ? hasValue(t, v.attribute) : FALSE));
      default: {
        const field = customBySlug.get(name);
        return field ? valueList(values, v => customMatch(t, field, v)) : FALSE;
      }
    }
  }

  /** `t` relates to some issue satisfying `target` by the named link, e.g. `subtask of`. */
  function linked(t: IssueTable, linkName: string, depth: number, target: (other: IssueTable) => SQL): SQL {
    const link = ISSUE_LINKS.find(l => l.name === linkName);
    if (!link) return FALSE;
    // An alias has the same columns under another name; Drizzle types the name, hence the cast.
    const name = `t${depth + 1}`;
    const other = alias(issues, name) as unknown as IssueTable;
    const from = sql`issues ${sql.identifier(name)}`;
    const candidate = and(inScope(other), target(other))!;
    if (link.type === 'subtask') {
      const join = link.direction === 'inward' ? sql`${other.id} = ${t.parent_id}` : sql`${other.parent_id} = ${t.id}`;
      return sql`exists (select 1 from ${from} where ${join} and ${candidate})`;
    }
    const outward = sql`(l.from_issue_id = ${t.id} and l.to_issue_id = ${other.id})`;
    const inward = sql`(l.to_issue_id = ${t.id} and l.from_issue_id = ${other.id})`;
    const direction =
      link.type === 'relates' ? sql`(${outward} or ${inward})` : link.direction === 'outward' ? outward : inward;
    return sql`exists (select 1 from issue_links l, ${from} where l.org_id = ${orgId} and l.type = ${link.type} and ${direction} and ${candidate})`;
  }

  function textMatch(t: IssueTable, text: string, phrase: boolean): SQL {
    const negated = phrase && text.startsWith('-');
    const body = negated ? text.slice(1) : text;
    const tsquery = phrase ? sql`phraseto_tsquery('english', ${body})` : sql`plainto_tsquery('english', ${body})`;
    // A stop-word-only term ("the") yields an empty tsquery; it filters nothing rather than everything.
    let match = sql`(numnode(${tsquery}) = 0 or ${t.search_tsv} @@ ${tsquery})`;
    if (!phrase && parseIssueKey(body)) match = sql`(${match} or ${keyMatch(t, body)})`;
    return negated ? sql`not ${match}` : match;
  }

  function clause(t: IssueTable, c: Clause, depth: number): SQL {
    switch (c.kind) {
      case 'attribute':
        return attribute(t, c.attribute, c.values);
      case 'link':
        return valueList(c.values, v => (v.kind === 'key' ? linked(t, c.link, depth, o => keyMatch(o, v.key)) : FALSE));
      case 'aggregate':
        if (depth >= MAX_DEPTH) return FALSE;
        return linked(t, c.link, depth, o => where(o, c.query, depth + 1));
      case 'shorthand':
        return or(
          byName('workflow_statuses', sql`${t.status_id}`, c.value),
          byName('priorities', sql`${t.priority_id}`, c.value),
          byName('issue_types', sql`${t.type_id}`, c.value),
          tagged(t, tagMatch(c.value)),
          sprintMatch(t, c.value),
          ...[...customBySlug.values()]
            .filter(f => f.kind === 'option')
            .map(f => customMatch(t, f, { kind: 'literal', value: c.value, negated: false })),
        )!;
      case 'category':
        return c.category === 'starred'
          ? sql`exists (select 1 from issue_stars st where st.issue_id = ${t.id} and st.org_id = ${orgId} and st.user_id = ${userId})`
          : statusIn(t, c.category);
      case 'view':
        return where(t, c.query, depth);
      case 'text':
        return textMatch(t, c.text, c.phrase);
      case 'sort':
        return TRUE;
    }
  }

  function where(t: IssueTable, query: Query, depth: number): SQL {
    return and(...query.clauses.map(c => clause(t, c, depth))) ?? TRUE;
  }

  /** Positive free text across the query, views included, as one tsquery for ranking. */
  function rankQuery(query: Query): SQL | null {
    const terms: SQL[] = [];
    const walk = (q: Query) => {
      for (const c of q.clauses) {
        if (c.kind === 'text' && !(c.phrase && c.text.startsWith('-'))) {
          terms.push(
            c.phrase ? sql`phraseto_tsquery('english', ${c.text})` : sql`plainto_tsquery('english', ${c.text})`,
          );
        } else if (c.kind === 'view') walk(c.query);
      }
    };
    walk(query);
    return terms.length === 0 ? null : sql.join(terms, sql` && `);
  }

  function sortExpression(t: IssueTable, attributeName: string): SQL[] {
    switch (attributeName) {
      case 'created':
        return [sql`${t.created_at}`];
      case 'updated':
        return [sql`${t.updated_at}`];
      case 'resolved date':
        return [sql`${t.resolved_at}`];
      case 'due date':
        return [sql`${t.due_date}`];
      case 'start date':
        return [sql`${t.start_date}`];
      case 'priority':
        return [sql`(select x.position from priorities x where x.id = ${t.priority_id})`];
      case 'status':
        return [sql`(select x.position from workflow_statuses x where x.id = ${t.status_id})`];
      case 'type':
        return [sql`(select x.position from issue_types x where x.id = ${t.type_id})`];
      case 'story points':
        return [sql`${t.story_points}`];
      case 'estimation':
        return [estimate(t)];
      case 'spent time':
        return [sql`${t.spent_minutes}`];
      case 'votes':
        return [sql`${t.vote_count}`];
      case 'key':
        return [sql`(select p.key from projects p where p.id = ${t.project_id})`, sql`${t.key_number}`];
      default: {
        const field = customBySlug.get(attributeName);
        return field ? customSort(t, field) : [];
      }
    }
  }

  /** A custom field's values as group rows (`k v l c o`, as the list's other groupings), or null when it cannot group. */
  function customGroup(t: IssueTable, slug: string): SQL | null {
    const field = customBySlug.get(slug);
    const from = sql`from issue_field_values v join custom_fields f on f.id = v.field_id and f.org_id = v.org_id`;
    const where = sql`where v.issue_id = ${t.id} and v.org_id = ${orgId} and f.slug = ${slug} and ${applies(t)}`;
    switch (field?.kind) {
      case 'option':
        return sql`(select lower(o.name) k, o.name v, o.name l, o.color c, o.position::int o ${from} join custom_field_options o on o.id = v.option_id and o.org_id = v.org_id ${where})`;
      case 'person':
        return sql`(select lower(m.username) k, m.username v, u.name l, null::text c, 0 o ${from} join org_members m on m.org_id = v.org_id and m.user_id = v.user_id join users u on u.id = v.user_id ${where})`;
      case 'checkbox':
        return sql`(select 'yes' k, 'Yes' v, 'Yes' l, null::text c, 0 o ${from} ${where} and v.value_bool limit 1)`;
      default:
        return null;
    }
  }

  return {
    customGroup: (slug: string, t: IssueTable = issues) => customGroup(t, slug),

    /** Scope, liveness and the whole query as one predicate on `issues`. */
    where(query: Query, t: IssueTable = issues): SQL {
      return and(inScope(t), where(t, query, 0))!;
    },

    /**
     * Explicit keys first; with none, free text ranks by relevance and everything else
     * is newest first. `id` breaks every tie so paging is stable.
     */
    orderBy(query: Query, keys: readonly SortKey[], t: IssueTable = issues): SQL[] {
      const out: SQL[] = [];
      if (keys.length > 0) {
        for (const key of keys) {
          for (const expr of sortExpression(t, key.attribute)) {
            out.push(key.direction === 'desc' ? sql`${expr} desc nulls last` : sql`${expr} asc nulls last`);
          }
        }
      } else {
        const rank = rankQuery(query);
        if (rank) out.push(sql`ts_rank(${t.search_tsv}, ${rank}) desc`);
        out.push(sql`${t.created_at} desc`);
      }
      out.push(sql`${t.id} desc`);
      return out;
    },
  };
}

export type IssueSearch = ReturnType<typeof issueSearch>;
