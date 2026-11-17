/**
 * A field's name inside a sentence: `Vendor reference` → `vendor reference`. An acronym keeps its
 * capitals (`SLA tier`), since lower-casing it would misspell it.
 */
export const fieldNameInSentence = (name: string) =>
  /^\p{Lu}\p{Ll}/u.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;

/** The label a field without a configured one shows when it has no value: `No severity`. */
export const emptyLabel = (fieldName: string) => `No ${fieldNameInSentence(fieldName)}`;
