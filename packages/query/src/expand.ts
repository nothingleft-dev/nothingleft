import type { Clause, Query, SortKey } from './ast.ts';
import { QueryError } from './tokenizer.ts';

export const SAVED_VIEW_MAX_DEPTH = 5;

/** A saved view's stored AST by name, or `undefined` when `#{name}` is not a view the caller can see. */
export type SavedViewLookup = (name: string) => Query | undefined;

/** Every `#value` shorthand in the query, nested ones included, for fetching the views they may name. */
export function shorthandNames(query: Query): string[] {
  const out = new Set<string>();
  const walk = (q: Query) => {
    for (const clause of q.clauses) {
      if (clause.kind === 'shorthand') out.add(clause.value);
      else if (clause.kind === 'aggregate' || clause.kind === 'view') walk(clause.query);
    }
  };
  walk(query);
  return [...out];
}

/**
 * Replaces each `#{Name}` that names a visible saved view with a `view` clause holding
 * that view's query, recursively. A view wins over an enum value of the same name.
 * `self` names the view whose query this is, so a reference back to it is a cycle.
 */
export function expandSavedViews(query: Query, lookup: SavedViewLookup, self?: string): Query {
  const expand = (q: Query, trail: string[]): Query => ({
    clauses: q.clauses.map((clause): Clause => {
      if (clause.kind === 'aggregate') return { ...clause, query: expand(clause.query, trail) };
      if (clause.kind !== 'shorthand') return clause;
      const view = lookup(clause.value);
      if (!view) return clause;
      const name = clause.value.toLowerCase();
      if (trail.includes(name) || trail.length >= SAVED_VIEW_MAX_DEPTH) {
        throw new QueryError('query.saved_view_cycle', { start: 0, end: 0 }, { name: clause.value });
      }
      return { kind: 'view', name: clause.value, query: expand(view, [...trail, name]) };
    }),
  });
  return expand(query, self ? [self.toLowerCase()] : []);
}

/** The effective order: the query's own `sort by:` first, else the first one found inside a referenced view. */
export function sortKeysOf(query: Query): SortKey[] {
  const own = query.clauses.filter(c => c.kind === 'sort').flatMap(c => c.keys);
  if (own.length > 0) return own;
  for (const clause of query.clauses) {
    if (clause.kind === 'view') {
      const nested = sortKeysOf(clause.query);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}
