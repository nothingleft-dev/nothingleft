import type { MessageKey } from '@nothingleft/i18n';
import { ISSUE_LINK_NAMES } from '@nothingleft/types';

export type AttributeType =
  | 'project'
  | 'enum'
  | 'user'
  | 'text'
  | 'key'
  | 'instant'
  | 'date'
  | 'duration'
  | 'number'
  | 'boolean'
  | 'has'
  | 'sort';

export interface Label {
  key: MessageKey;
  params?: Record<string, string | number>;
}

export interface AttributeDefinition {
  /** Canonical lowercase name as typed before the colon, e.g. `created by`. */
  name: string;
  type: AttributeType;
  description: Label;
  /** Value group shown in the suggestion dropdown, and the `#value` source. */
  group?: Label;
  sortable?: boolean;
  /** Participates in the bare `#value` shorthand. */
  shorthand?: boolean;
  /** The value that means "none", e.g. `Unassigned` or `No due date`. */
  empty?: string;
  /** Set on a custom field's attribute: its slug is the attribute name. */
  custom?: boolean;
}

export interface LinkDefinition {
  /** Lowercase link name as typed, e.g. `subtask of`. */
  name: string;
  type: string;
  direction: 'outward' | 'inward';
}

export interface Registry {
  attributes: readonly AttributeDefinition[];
  links: readonly LinkDefinition[];
  categories: readonly string[];
  /** Names `has:` accepts: every value-bearing attribute plus fields that are only ever tested for presence. */
  existence: readonly string[];
  attribute(name: string): AttributeDefinition | undefined;
  link(name: string): LinkDefinition | undefined;
  /** Longest attribute or link name in words, bounding the parser's lookahead. */
  maxWords: number;
}

const words = (name: string) => name.split(' ').length;

export interface RegistryOptions {
  attributes: readonly AttributeDefinition[];
  links?: readonly LinkDefinition[];
  categories?: readonly string[];
  /** Fields `has:` can test that are not searchable attributes, e.g. `description`. */
  presenceOnly?: readonly string[];
}

export function buildRegistry({
  attributes,
  links = [],
  categories = [],
  presenceOnly = [],
}: RegistryOptions): Registry {
  const byName = new Map(attributes.map(attribute => [attribute.name, attribute]));
  const linksByName = new Map(links.map(link => [link.name, link]));
  const maxWords = Math.max(1, ...attributes.map(a => words(a.name)), ...links.map(l => words(l.name) + 1));
  const existence = [
    ...presenceOnly,
    ...attributes
      .filter(a => a.type !== 'has' && a.type !== 'sort' && a.type !== 'key' && a.type !== 'project')
      .map(a => a.name),
  ];
  return {
    attributes,
    links,
    categories,
    existence,
    attribute: name => byName.get(name.toLowerCase().replace(/\s+/g, ' ')),
    link: name => linksByName.get(name.toLowerCase().replace(/\s+/g, ' ')),
    maxWords,
  };
}

export const ISSUE_LINKS: readonly LinkDefinition[] = ISSUE_LINK_NAMES;
