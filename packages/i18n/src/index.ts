import en from '../en.json';

export type MessageKey = keyof typeof en;
type StripErrorPrefix<K> = K extends `error.${infer C}` ? C : never;
export type ErrorCode = StripErrorPrefix<MessageKey>;

type Params = Record<string, string | number>;

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * `{name}` substitutes a parameter; `{count|issue|issues}` renders the count grouped (`1,284`)
 * followed by the noun that agrees with it, so no message says "1 issues".
 */
export function t(key: MessageKey, params: Params = {}): string {
  const template: string = en[key];
  return template.replace(
    /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g,
    (match, name: string, one: string | undefined, many: string | undefined) => {
      if (!(name in params)) return match;
      const value = params[name]!;
      if (one === undefined) return String(value);
      const n = Number(value);
      return `${grouped(n)} ${n === 1 ? one : many}`;
    },
  );
}

export const errorKey = (code: ErrorCode): MessageKey => `error.${code}`;

export function hasMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}
