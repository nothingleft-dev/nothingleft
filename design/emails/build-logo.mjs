import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const brand = readFileSync(join(here, '../../apps/marketing/src/lib/brand.ts'), 'utf8');
const pick = name => new RegExp(`${name}\\s*=\\s*([\\s\\S]*?);\\n`).exec(brand)[1];
const bars = eval(pick('MARK_BARS'));
const lastBar = eval(pick('MARK_LAST_BAR'));
const ring = eval(`(${pick('WORDMARK_RING')})`);
const underline = eval(`(${pick('WORDMARK_UNDERLINE')})`);
const letters = eval(pick('WORDMARK_LETTERS'));

const ICON = 22;
const WORD_HEIGHT = 20;
const GAP = 8;
const wordWidth = Math.round((WORD_HEIGHT * 303.17) / 60.47);
const width = ICON + GAP + wordWidth;
// `universal` is the default image: clients that ignore the colour scheme (Gmail recolours the page itself) show it on either background.
const themes = {
  universal: { ink: '#7d8087', accent: '#f3b621' },
  light: { ink: '#151618', accent: '#f3b621' },
  dark: { ink: '#e9ebee', accent: '#f9bc2c' },
};

for (const [theme, { ink, accent }] of Object.entries(themes)) {
  const name = theme === 'universal' ? 'logo' : `logo-${theme}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ICON}" viewBox="0 0 ${width} ${ICON}">
<svg x="0" y="0" width="${ICON}" height="${ICON}" viewBox="0 0 40 40">${bars.map(p => `<polygon points="${p}" fill="${ink}"/>`).join('')}<polygon points="${lastBar}" fill="${accent}"/></svg>
<svg x="${ICON + GAP}" y="${(ICON - WORD_HEIGHT) / 2}" width="${wordWidth}" height="${WORD_HEIGHT}" viewBox="3.25 23.03 303.17 60.47"><path fill="${ink}" d="${letters}"/><circle fill="none" stroke="${accent}" cx="${ring.cx}" cy="${ring.cy}" r="${ring.r}" stroke-width="${ring.strokeWidth}"/><rect fill="${accent}" x="${underline.x}" y="${underline.y}" width="${underline.width}" height="${underline.height}" rx="${underline.rx}"/></svg>
</svg>`;
  writeFileSync(join(here, `logo/${name}.svg`), svg);
  writeFileSync(join(here, `logo/render-${name}.html`), `<!doctype html><body style="margin:0;background:transparent"><img src="${name}.svg" width="${width * 2}" height="${ICON * 2}" style="display:block"></body>`);
  const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--screenshot=${join(here, `logo/${name}.png`)}`, `--window-size=${width * 2},${ICON * 2}`, `file://${join(here, `logo/render-${name}.html`)}`], { stdio: 'ignore' });
}
console.log(`lockup ${width}x${ICON} css px, PNGs at 2x`);
