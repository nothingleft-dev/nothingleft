import { toolReference } from '../src/reference.ts';

const target = new URL('../../../docs/manual/mcp-tools.md', import.meta.url);
await Bun.write(target, toolReference());
console.log(`wrote ${target.pathname}`);
