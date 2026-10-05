import { describe, it } from 'bun:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
