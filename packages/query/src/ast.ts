export type DateUnit = 'm' | 'h' | 'd' | 'w' | 'M' | 'y';

export type DateKeyword =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'now'
  | 'this week'
  | 'last week'
  | 'next week'
  | 'this month'
  | 'last month'
  | 'next month'
  | 'this year'
  | 'last year'
  | 'next year';

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DateValue =
  | { kind: 'date'; date: string }
  | { kind: 'month'; month: string }
  | { kind: 'keyword'; keyword: DateKeyword }
  | { kind: 'weekday'; weekday: Weekday }
  | { kind: 'relative'; sign: -1 | 1; amount: number; unit: DateUnit };

export type ScalarValue =
  | { kind: 'literal'; value: string }
  | { kind: 'me' }
  | { kind: 'empty' }
  | { kind: 'category'; category: 'resolved' | 'unresolved' }
  | { kind: 'number'; value: number }
  | { kind: 'duration'; raw: string }
  | { kind: 'key'; key: string }
  | { kind: 'attribute'; attribute: string }
  | DateValue;

export type Bound = { kind: 'number'; value: number } | { kind: 'duration'; raw: string } | DateValue;

export type RangeValue = { kind: 'range'; from: Bound | null; to: Bound | null };

export type Value = (ScalarValue | RangeValue) & { negated: boolean };

export type SortDirection = 'asc' | 'desc';

export interface SortKey {
  attribute: string;
  direction: SortDirection;
}

export type Clause =
  | { kind: 'attribute'; attribute: string; values: Value[] }
  | { kind: 'link'; link: string; values: Value[] }
  | { kind: 'aggregate'; link: string; query: Query }
  | { kind: 'shorthand'; value: string }
  | { kind: 'category'; category: 'resolved' | 'unresolved' | 'starred' }
  | { kind: 'sort'; keys: SortKey[] }
  | { kind: 'text'; text: string; phrase: boolean }
  /** A `#{Name}` reference replaced by the saved view's query; never produced by the parser. */
  | { kind: 'view'; name: string; query: Query };

export interface Query {
  clauses: Clause[];
}
