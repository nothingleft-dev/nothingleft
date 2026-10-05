import base from '@nothingleft/config/eslint';

export default [
  ...base,
  { files: ['packages/db/**'], rules: { 'nothingleft/no-raw-db': 'off' } },
  {
    files: ['apps/api/src/**/*.ts'],
    // Env defaults and constants are operator configuration, not copy.
    ignores: ['apps/api/src/config/**'],
    rules: { 'nothingleft/no-user-facing-literals': 'error' },
  },
  // Rule 3: MCP is a client of the public REST API, never of the database or the services.
  { files: ['packages/mcp/**', 'packages/mcp-stdio/**'], rules: { 'nothingleft/mcp-api-only': 'error' } },
];
