import type { Query } from './ast.ts';
import type { Registry } from './registry/registry.ts';
import { QueryError, type Span } from './tokenizer.ts';

export interface VocabularyEntry {
  /** Lowercased spellings that match, e.g. a project's key and its name. */
  accepted: ReadonlySet<string>;
  /** What `valid_values` lists. */
  display: readonly string[];
}

/**
 * Names that exist in the caller's scope, keyed by attribute name; people attributes share
 * the `user` entry. An attribute absent here is not checked.
 */
export type Vocabulary = Readonly<Record<string, VocabularyEntry>>;

export const SHORTHAND_ATTRIBUTE = '#';
export const VALID_VALUES_MAX = 100;

const PEOPLE = 'user';

function entryFor(attribute: string, registry: Registry, vocabulary: Vocabulary): VocabularyEntry | undefined {
  if (registry.attribute(attribute)?.type === 'user') return vocabulary[PEOPLE];
  return vocabulary[attribute];
}

const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** The attributes whose names a query mentions, so a caller fetches only the vocabulary it needs. */
export function vocabularyNeeds(query: Query, registry: Registry): Set<string> {
  const out = new Set<string>();
  const walk = (q: Query) => {
    for (const clause of q.clauses) {
      if (clause.kind === 'attribute') {
        const type = registry.attribute(clause.attribute)?.type;
        if (clause.values.some(v => v.kind === 'literal')) out.add(type === 'user' ? PEOPLE : clause.attribute);
      } else if (clause.kind === 'shorthand') {
        for (const a of registry.attributes) if (a.shorthand) out.add(a.name);
      } else if (clause.kind === 'aggregate' || clause.kind === 'view') {
        walk(clause.query);
      }
    }
  };
  walk(query);
  return out;
}

/**
 * Refuses a value that names nothing in scope — `status: Donee`, `assignee: @nobody`,
 * `#Foo` — with the valid choices, instead of silently matching nothing.
 * `spans` are the parser's top-level clause spans; a nested failure points at its outer clause.
 */
export function checkValues(query: Query, registry: Registry, vocabulary: Vocabulary, spans: readonly Span[]): void {
  const fail = (span: Span, attribute: string, value: string, display: readonly string[]) => {
    throw new QueryError('query.invalid_value', span, { attribute, value }, display.slice(0, VALID_VALUES_MAX));
  };

  const walk = (q: Query, outer: Span | undefined) => {
    q.clauses.forEach((clause, index) => {
      const span = outer ?? spans[index] ?? { start: 0, end: 0 };
      switch (clause.kind) {
        case 'attribute': {
          const entry = entryFor(clause.attribute, registry, vocabulary);
          if (!entry) return;
          for (const value of clause.values) {
            if (value.kind !== 'literal') continue;
            const name = normalise(value.value).replace(/^@/, '');
            if (!entry.accepted.has(name) && !entry.accepted.has(normalise(value.value))) {
              fail(span, clause.attribute, value.value, entry.display);
            }
          }
          return;
        }
        case 'shorthand': {
          const name = normalise(clause.value);
          const sources = registry.attributes.filter(a => a.shorthand).map(a => vocabulary[a.name]);
          if (sources.some(entry => entry === undefined)) return;
          if (!sources.some(entry => entry!.accepted.has(name))) {
            fail(
              span,
              SHORTHAND_ATTRIBUTE,
              clause.value,
              sources.flatMap(entry => entry!.display),
            );
          }
          return;
        }
        case 'aggregate':
        case 'view':
          walk(clause.query, span);
          return;
        default:
          return;
      }
    });
  };
  walk(query, undefined);
}
