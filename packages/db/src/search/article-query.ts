import { and, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { slugify } from '@nothingleft/format';
import {
  dateInZone,
  resolveDatePeriod,
  type Bound,
  type Clause,
  type DateValue,
  type Query,
  type SortKey,
  type Value,
  type Weekday,
} from '@nothingleft/query';
import { articles } from '../schema/index.ts';

/**
 * Who may see which articles: `projectIds` are readable; `ownDraftProjectIds` show the caller's own
 * drafts (Contributor and up there); `adminProjectIds` show everyone's.
 */
export interface ArticleSearchScope {
  orgId: number;
  userId: number;
  projectIds: readonly number[];
  ownDraftProjectIds: readonly number[];
  adminProjectIds: readonly number[];
  timezone: string;
  today: string;
  weekStartsOn: Weekday;
  now: Date;
}

type ArticleTable = typeof articles;

const TRUE = sql`true`;
const FALSE = sql`false`;

const ids = (list: readonly number[]) =>
  sql.join(
    list.map(id => sql`${id}`),
    sql`, `,
  );

/**
 * Live articles the caller may open: a readable project, and published, or their own draft,
 * or a draft in a project they administer. Every article query starts here.
 */
export function articleVisible(
  scope: Pick<ArticleSearchScope, 'orgId' | 'userId' | 'projectIds' | 'ownDraftProjectIds' | 'adminProjectIds'>,
  t: ArticleTable = articles,
): SQL {
  if (scope.projectIds.length === 0) return FALSE;
  const own =
    scope.ownDraftProjectIds.length === 0
      ? FALSE
      : sql`(${t.created_by} = ${scope.userId} and ${t.project_id} in (${ids(scope.ownDraftProjectIds)}))`;
  const drafts =
    scope.adminProjectIds.length === 0 ? own : sql`(${own} or ${t.project_id} in (${ids(scope.adminProjectIds)}))`;
  return sql`(${t.org_id} = ${scope.orgId} and ${t.deleted_at} is null and ${t.project_id} in (${ids(scope.projectIds)}) and (${t.status} = 'published' or ${drafts}))`;
}

function preciseInstant(value: DateValue, now: Date): Date | null {
  if (value.kind === 'keyword' && value.keyword === 'now') return now;
  if (value.kind === 'relative' && (value.unit === 'm' || value.unit === 'h')) {
    const ms = value.amount * (value.unit === 'm' ? 60_000 : 3_600_000);
    return new Date(now.getTime() + value.sign * ms);
  }
  return null;
}

const isDate = (bound: Bound): bound is DateValue => bound.kind !== 'number' && bound.kind !== 'duration';

/** The knowledge base's compiler: the article registry's AST as one predicate and an order on `articles`. */
export function articleSearch(scope: ArticleSearchScope) {
  const { orgId, userId } = scope;
  const tz = scope.timezone;

  const startOfDay = (day: string) => sql`((${day})::date::timestamp at time zone ${tz})`;
  const endOfDay = (day: string) => sql`(((${day})::date + 1)::timestamp at time zone ${tz})`;

  const dayPeriod = (value: DateValue) => {
    const instant = preciseInstant(value, scope.now);
    if (instant) {
      const day = dateInZone(instant, tz);
      return { start: day, end: day };
    }
    return resolveDatePeriod(value, { today: scope.today, weekStartsOn: scope.weekStartsOn })!;
  };

  function instantRange(column: SQL, value: Value): SQL {
    const lower = (bound: Bound) => {
      if (!isDate(bound)) return FALSE;
      const precise = preciseInstant(bound, scope.now);
      return precise
        ? sql`${column} >= ${precise.toISOString()}`
        : sql`${column} >= ${startOfDay(dayPeriod(bound).start)}`;
    };
    const upper = (bound: Bound) => {
      if (!isDate(bound)) return FALSE;
      const precise = preciseInstant(bound, scope.now);
      return precise ? sql`${column} <= ${precise.toISOString()}` : sql`${column} < ${endOfDay(dayPeriod(bound).end)}`;
    };
    if (value.kind === 'range') {
      return and(value.from ? lower(value.from) : undefined, value.to ? upper(value.to) : undefined) ?? TRUE;
    }
    const bound = value as Bound;
    if (!isDate(bound)) return FALSE;
    const precise = preciseInstant(bound, scope.now);
    if (precise) return sql`${column} >= ${precise.toISOString()}`;
    return and(lower(bound), upper(bound))!;
  }

  function valueList(values: Value[], match: (value: Value) => SQL): SQL {
    const positive = values.filter(v => !v.negated).map(match);
    const negative = values.filter(v => v.negated).map(v => sql`not coalesce(${match(v)}, false)`);
    return and(positive.length > 0 ? or(...positive) : undefined, ...negative) ?? TRUE;
  }

  const literal = (v: Value) => (v as { value: string }).value;

  const personOf = (value: Value): SQL =>
    value.kind === 'me'
      ? sql`${userId}`
      : sql`(select m.user_id from org_members m where m.org_id = ${orgId} and lower(m.username) = lower(${literal(value).replace(/^@/, '')}))`;

  const tagged = (t: ArticleTable, extra: SQL) =>
    sql`exists (select 1 from article_tags at join tags tg on tg.id = at.tag_id and tg.org_id = at.org_id where at.article_id = ${t.id} and at.org_id = ${orgId} and ${extra})`;
  const tagMatch = (name: string) => sql`(lower(tg.name) = lower(${name}) or tg.slug = ${slugify(name)})`;
  const statusIs = (t: ArticleTable, name: string) => sql`${t.status} = ${name.trim().toLowerCase()}`;

  // Everything under a named article, at any depth — the tree is at most three deep, so two hops.
  function under(t: ArticleTable, name: string): SQL {
    const named = alias(articles, 'pn');
    const middle = alias(articles, 'pm');
    const matches = sql`(select ${named.id} from articles ${sql.identifier('pn')} where ${articleVisible(scope, named as unknown as ArticleTable)} and (lower(${named.title}) = lower(${name}) or lower(${named.slug}) = lower(${name})))`;
    return sql`(${t.parent_id} in ${matches} or exists (select 1 from articles ${sql.identifier('pm')} where ${middle.id} = ${t.parent_id} and ${middle.org_id} = ${orgId} and ${middle.parent_id} in ${matches}))`;
  }

  function hasValue(t: ArticleTable, name: string): SQL {
    switch (name) {
      case 'tag':
        return tagged(t, TRUE);
      case 'parent':
        return sql`${t.parent_id} is not null`;
      default:
        return TRUE;
    }
  }

  function attribute(t: ArticleTable, name: string, values: Value[]): SQL {
    switch (name) {
      case 'tag':
        return valueList(values, v => tagged(t, tagMatch(literal(v))));
      case 'status':
        return valueList(values, v => statusIs(t, literal(v)));
      case 'created by':
        return valueList(values, v => sql`${t.created_by} = ${personOf(v)}`);
      case 'updated by':
        return valueList(values, v => sql`${t.updated_by} = ${personOf(v)}`);
      case 'created':
        return valueList(values, v => instantRange(sql`${t.created_at}`, v));
      case 'updated':
        return valueList(values, v => instantRange(sql`${t.updated_at}`, v));
      case 'parent':
        return valueList(values, v => (v.kind === 'empty' ? sql`${t.parent_id} is null` : under(t, literal(v))));
      case 'has':
        return valueList(values, v => (v.kind === 'attribute' ? hasValue(t, v.attribute) : FALSE));
      default:
        return FALSE;
    }
  }

  function textMatch(t: ArticleTable, text: string, phrase: boolean): SQL {
    const negated = phrase && text.startsWith('-');
    const body = negated ? text.slice(1) : text;
    const tsquery = phrase ? sql`phraseto_tsquery('english', ${body})` : sql`plainto_tsquery('english', ${body})`;
    const match = sql`(numnode(${tsquery}) = 0 or ${t.search_tsv} @@ ${tsquery})`;
    return negated ? sql`not ${match}` : match;
  }

  function clause(t: ArticleTable, c: Clause): SQL {
    switch (c.kind) {
      case 'attribute':
        return attribute(t, c.attribute, c.values);
      case 'shorthand':
        return or(statusIs(t, c.value), tagged(t, tagMatch(c.value)))!;
      case 'text':
        return textMatch(t, c.text, c.phrase);
      case 'view':
        return and(...c.query.clauses.map(inner => clause(t, inner))) ?? TRUE;
      case 'sort':
        return TRUE;
      default:
        return FALSE;
    }
  }

  function rankQuery(query: Query): SQL | null {
    const terms = query.clauses
      .filter((c): c is Extract<Clause, { kind: 'text' }> => c.kind === 'text' && !(c.phrase && c.text.startsWith('-')))
      .map(c => (c.phrase ? sql`phraseto_tsquery('english', ${c.text})` : sql`plainto_tsquery('english', ${c.text})`));
    return terms.length === 0 ? null : sql.join(terms, sql` && `);
  }

  const sortExpression = (t: ArticleTable, name: string): SQL | null =>
    name === 'created' ? sql`${t.created_at}` : name === 'updated' ? sql`${t.updated_at}` : null;

  return {
    /** Visibility, liveness and the whole query as one predicate on `articles`. */
    where(query: Query, t: ArticleTable = articles): SQL {
      return and(articleVisible(scope, t), ...query.clauses.map(c => clause(t, c)))!;
    },

    /** Explicit keys first; else relevance with free text, else most recently updated. `id` breaks ties. */
    orderBy(query: Query, keys: readonly SortKey[], t: ArticleTable = articles): SQL[] {
      const out: SQL[] = [];
      for (const key of keys) {
        const expr = sortExpression(t, key.attribute);
        if (expr) out.push(key.direction === 'desc' ? sql`${expr} desc` : sql`${expr} asc`);
      }
      if (out.length === 0) {
        const rank = rankQuery(query);
        if (rank) out.push(sql`ts_rank(${t.search_tsv}, ${rank}) desc`);
        out.push(sql`${t.updated_at} desc`);
      }
      out.push(sql`${t.id} desc`);
      return out;
    },
  };
}

export type ArticleSearch = ReturnType<typeof articleSearch>;
