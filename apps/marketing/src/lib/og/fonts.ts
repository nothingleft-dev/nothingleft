import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Font } from 'satori';

// Satori reads TTF and WOFF but not WOFF2, so the cards use fontsource's WOFF files.
const resolve = createRequire(import.meta.url).resolve;

const font = (name: string, weight: Font['weight'], file: string): Font => ({
  name,
  weight,
  style: 'normal',
  data: readFileSync(resolve(file)),
});

let cache: Font[] | undefined;

export function ogFonts(): Font[] {
  cache ??= [
    font('Inter', 400, '@fontsource/inter/files/inter-latin-400-normal.woff'),
    font('Inter', 500, '@fontsource/inter/files/inter-latin-500-normal.woff'),
    font('Inter', 600, '@fontsource/inter/files/inter-latin-600-normal.woff'),
    font('Inter', 700, '@fontsource/inter/files/inter-latin-700-normal.woff'),
    font('JetBrains Mono', 400, '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'),
    font('JetBrains Mono', 500, '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff'),
    font('JetBrains Mono', 600, '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff'),
    font('JetBrains Mono', 700, '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'),
  ];
  return cache;
}
