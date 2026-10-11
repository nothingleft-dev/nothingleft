#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { version } from '../package.json' with { type: 'json' };
import { createProxy } from './proxy.ts';

const DEFAULT_URL = 'https://api.nothingleft.dev/mcp';

const token = process.env['NOTHINGLEFT_TOKEN'];
if (!token || !token.startsWith('nl_pat_')) {
  process.stderr.write(
    'nothingleft-mcp: set NOTHINGLEFT_TOKEN to a personal access token (nl_pat_…). Create one in Nothing Left under Settings → Access tokens.\n',
  );
  process.exit(1);
}

const handle = createProxy({
  url: process.env['NOTHINGLEFT_MCP_URL'] ?? DEFAULT_URL,
  token,
  fetch: request => fetch(request),
  write: line => process.stdout.write(`${line}\n`),
  version,
});

// Lines are handled concurrently: a client may send its next request before the last answer arrives.
const pending = new Set<Promise<void>>();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  const task = handle(line).finally(() => pending.delete(task));
  pending.add(task);
});
lines.on('close', async () => {
  await Promise.all(pending);
  process.exit(0);
});
