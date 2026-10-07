import base from '@nothingleft/config/eslint';
import astro from 'eslint-plugin-astro';

export default [
  ...base,
  ...astro.configs.recommended,
  { ignores: ['dist/**', '.astro/**'] },
  { files: ['**/*.mjs'], languageOptions: { globals: { URL: 'readonly' } } },
];
