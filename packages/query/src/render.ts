import type { Bound, Clause, DateValue, Query, ScalarValue, Value } from './ast.ts';
import type { Registry } from './registry/registry.ts';

const NEEDS_BRACES = /[\s,:{}"#]|^-|^\*$|\.\./;

function word(text: string): string {
  return NEEDS_BRACES.test(text) ? `{${text}}` : text;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function renderDate(value: DateValue): string {
  switch (value.kind) {
    case 'date':
      return value.date;
    case 'month':
      return value.month;
    case 'keyword':
      return word(capitalise(value.keyword));
    case 'weekday':
      return WEEKDAY_NAMES[value.weekday - 1] as string;
    case 'relative':
      return `{${value.sign < 0 ? 'minus' : 'plus'} ${value.amount}${value.unit}}`;
  }
}

function bound(value: Bound): string {
  switch (value.kind) {
    case 'number':
      return value.value < 0 ? `{${value.value}}` : String(value.value);
    case 'duration':
      return word(value.raw);
    default:
      return renderDate(value);
  }
}

function scalar(value: ScalarValue, empty: string | undefined): string {
  switch (value.kind) {
    case 'literal':
      return word(value.value);
    case 'me':
      return 'me';
    case 'empty':
      return word(empty ?? 'None');
    case 'category':
      return capitalise(value.category);
    case 'key':
      return value.key;
    case 'attribute':
      return word(value.attribute);
    default:
      return bound(value);
  }
}

function renderValue(value: Value, empty: string | undefined): string {
  const sign = value.negated ? '-' : '';
  if (value.kind === 'range') {
    const from = value.from ? bound(value.from) : '';
    const to = value.to ? bound(value.to) : '';
    return `${sign}${from ? `${from} ` : ''}..${to ? ` ${to}` : ''}`;
  }
  return `${sign}${scalar(value, empty)}`;
}

export function renderClause(clause: Clause, registry: Registry): string {
  switch (clause.kind) {
    case 'attribute': {
      const empty = registry.attribute(clause.attribute)?.empty;
      return `${clause.attribute}: ${clause.values.map(value => renderValue(value, empty)).join(', ')}`;
    }
    case 'link':
      return `${clause.link}: ${clause.values.map(value => renderValue(value, undefined)).join(', ')}`;
    case 'aggregate':
      return `aggregate ${clause.link}: {${render(clause.query, registry)}}`;
    case 'shorthand':
      return `#${word(clause.value)}`;
    case 'category':
      return `#${clause.category === 'starred' ? 'Star' : capitalise(clause.category)}`;
    case 'sort':
      return `sort by: ${clause.keys
        .map(key => `${word(key.attribute)}${key.direction === 'desc' ? ' desc' : ''}`)
        .join(', ')}`;
    case 'text':
      return clause.phrase ? `"${clause.text}"` : clause.text;
    case 'view':
      return `#${word(clause.name)}`;
  }
}

/** AST → canonical query text. `parse(render(ast))` yields the same AST. */
export function render(query: Query, registry: Registry): string {
  return query.clauses.map(clause => renderClause(clause, registry)).join(' ');
}
