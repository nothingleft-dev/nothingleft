import en from '../en.json';

export type MessageKey = keyof typeof en;
type StripErrorPrefix<K> = K extends `error.${infer C}` ? C : never;
export type ErrorCode = StripErrorPrefix<MessageKey>;

type Params = Record<string, string | number>;

export function t(key: MessageKey, params: Params = {}): string {
  const template: string = en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export const errorKey = (code: ErrorCode): MessageKey => `error.${code}`;

export function hasMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}
