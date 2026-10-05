import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nothingleft from './eslint-plugin.mjs';

export { nothingleft };

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
  },
  {
    plugins: { nothingleft },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'nothingleft/no-raw-db': 'error',
    },
  },
);
