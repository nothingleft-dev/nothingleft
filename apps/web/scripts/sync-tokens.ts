import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(import.meta.dirname, '../../../design/tokens.css');
const target = resolve(import.meta.dirname, '../app/globals.css');
const START = '/* tokens:start — copied from design/tokens.css by `bun run tokens:sync`; do not edit here */';
const END = '/* tokens:end */';

const tokens = readFileSync(source, 'utf8').trim();
const css = readFileSync(target, 'utf8');
const start = css.indexOf(START);
const end = css.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  throw new Error(`globals.css is missing the ${START.slice(0, 16)}… / ${END} markers`);
}

const next = `${css.slice(0, start + START.length)}\n${tokens}\n${css.slice(end)}`;
if (next !== css) {
  writeFileSync(target, next);
  console.log('globals.css tokens updated');
} else {
  console.log('globals.css tokens already current');
}
