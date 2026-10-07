import base from '@nothingleft/config/prettier';

export default {
  ...base,
  plugins: ['prettier-plugin-astro'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
