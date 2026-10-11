import { describe, it } from 'bun:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

RuleTester.describe = describe;
RuleTester.it = it;
// Bun throws on reading it.only when CI is set, so defer it to a case that asks for it.
RuleTester.itOnly = (...args: Parameters<typeof it.only>) => it.only(...args);

export const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
