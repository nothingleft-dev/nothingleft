import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';

type AttributeRule = NonNullable<NonNullable<SanitizeSchema['attributes']>[string]>[number];
type ClassValue = string | RegExp;

const attributes = defaultSchema.attributes ?? {};

// hast-util-sanitize honours the first `className` rule per tag, so extra
// class values must be merged into the default rule rather than appended.
function withClasses(tag: string, classes: ClassValue[], extra: AttributeRule[] = []): AttributeRule[] {
  const rules = attributes[tag] ?? [];
  const existing = rules.find(rule => Array.isArray(rule) && rule[0] === 'className') as
    [string, ...ClassValue[]] | undefined;
  const rest = rules.filter(rule => rule !== existing);
  return [...rest, ['className', ...(existing?.slice(1) ?? []), ...classes] as AttributeRule, ...extra];
}

export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...attributes,
    a: withClasses('a', ['mention', 'issue-key', 'resolved'], ['dataMention', 'dataIssueKey']),
    span: withClasses('span', ['mention', /^hljs-/], ['dataMention']),
    code: withClasses('code', ['hljs']),
    input: [...(attributes.input ?? []), 'dataTask'],
  },
};
