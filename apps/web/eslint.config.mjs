import base from '@nothingleft/config/eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const sourceFiles = ['**/*.{ts,tsx}'];

const config = [
  ...base,
  ...nextVitals,
  ...nextTypescript,
  { ignores: ['.next/**', 'next-env.d.ts', 'next.config.ts'] },
  // eslint-plugin-react's version detection calls an API ESLint 10 removed; a fixed version skips it.
  { settings: { react: { version: '19' } } },
  { files: sourceFiles, ignores: ['lib/api/**'], rules: { 'nothingleft/no-http-client': 'error' } },
  { files: sourceFiles, ignores: ['lib/datetime/**'], rules: { 'nothingleft/no-date-formatting': 'error' } },
  { files: sourceFiles, ignores: ['components/markdown/**'], rules: { 'nothingleft/no-inner-html': 'error' } },
  // shadcn output wraps the native elements it replaces, so components/ui is the one exemption.
  { files: sourceFiles, ignores: ['components/ui/**'], rules: { 'nothingleft/no-native-controls': 'error' } },
];

export default config;
