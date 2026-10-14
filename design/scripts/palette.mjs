// Generates the 14-token colour palette from OKLCH targets and prints CSS (as oklch()) + a contrast report (computed on the sRGB hex).
// Run: node design/scripts/palette.mjs   (Node 18+, no deps)
const hues = {
  red: 25, orange: 50, amber: 75, yellow: 95, lime: 125, green: 150, teal: 180,
  cyan: 210, blue: 250, indigo: 275, violet: 300, pink: 345, brown: 60, gray: 260,
};
// role → [L, C] per theme. bg = tinted fill, fg = text on bg, solid = dot / edge / chart mark
const roles = {
  light: { bg: [0.955, 0.035], fg: [0.42, 0.13], solid: [0.60, 0.165] },
  dark:  { bg: [0.30, 0.055], fg: [0.86, 0.09],  solid: [0.62, 0.15] },
};
// per-hue lightness offsets for the solid role: warm/yellow hues read lighter, blue/violet darker.
// Varying L is what makes red-green confusable pairs separable under CVD.
const solidL = {
  light: { red: .56, orange: .66, amber: .66, yellow: .66, lime: .66, green: .55, teal: .60, cyan: .64, blue: .50, indigo: .50, violet: .50, pink: .62, brown: .54, gray: .58 },
  dark:  { red: .62, orange: .67, amber: .67, yellow: .67, lime: .66, green: .58, teal: .62, cyan: .66, blue: .58, indigo: .56, violet: .55, pink: .66, brown: .60, gray: .62 },
};
const chromaScale = { gray: 0.08, brown: 0.55, yellow: 0.85, lime: 0.85, amber: 0.95 };

function oklchToRgb(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const gam = x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
  return [gam(r), gam(g), gam(bb)];
}
const inGamut = (L, C, h) => {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [r, g, bb].every(x => x >= -0.0005 && x <= 1.0005);
};
function hex(L, C, h) {
  while (C > 0 && !inGamut(L, C, h)) C -= 0.002; // reduce chroma until in sRGB gamut
  const hx = '#' + oklchToRgb(L, C, h).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  return Object.assign(new String(hx), { oklch: `oklch(${L.toFixed(2)} ${C.toFixed(3)} ${h})` });
}
const lum = hx => { const c = [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x + 0.05) / (y + 0.05)).toFixed(2); };

export const surface = { light: '#ffffff', dark: '#1a1d21' };
export function build(overrideL = {}) {
const out = { light: {}, dark: {} };
for (const theme of ['light', 'dark']) {
  for (const [name, h] of Object.entries(hues)) {
    const cs = chromaScale[name] ?? 1;
    out[theme][name] = {};
    for (const [role, [L, C]] of Object.entries(roles[theme])) out[theme][name][role] = hex(role === 'solid' ? (overrideL[theme]?.[name] ?? solidL[theme][name]) : L, C * cs, h);
  }
}
return out;
}
export { hues, contrast };
if (process.argv[1] && process.argv[1].endsWith('palette.mjs')) {
const out = build();
let css = '';
for (const theme of ['light', 'dark']) {
  css += `\n  /* ${theme} */\n`;
  for (const name of Object.keys(hues)) {
    const t = out[theme][name];
    css += `  --palette-${name}-bg: ${t.bg.oklch}; --palette-${name}-fg: ${t.fg.oklch}; --palette-${name}-solid: ${t.solid.oklch};\n`;
  }
}
console.log(css);
console.log('\nContrast report (fg on bg ≥ 4.5 · solid on surface ≥ 3)');
for (const theme of ['light', 'dark']) for (const name of Object.keys(hues)) {
  const t = out[theme][name];
  console.log(theme.padEnd(6), name.padEnd(7), 'fg/bg', contrast(t.fg, t.bg), ' solid/surface', contrast(t.solid, surface[theme]));
}
console.log('\nChart order solids:');
const order = (process.env.ORDER || 'blue,orange,teal,amber,pink,green,violet,red').split(',');
for (const theme of ['light', 'dark']) console.log(theme, order.map(n => out[theme][n].solid).join(','));
}

// ---- label colours ---------------------------------------------------------
// The swatch grid for statuses, priorities and types: 8 families × 5 shades,
// pale (1) to deep (5). A swatch is one background for both themes; the text on
// it is chosen here for contrast, so a user only ever picks a background.
// `solid` is the dot / edge mark: the nearest shade of the family that clears
// 3:1 on each theme's surface, since a pale swatch vanishes as a dot.
export const labelFamilies = { gray: 260, red: 25, orange: 55, yellow: 90, green: 145, teal: 185, blue: 255, pink: 350 };
const labelSteps = [[0.91, 0.06], [0.83, 0.1], [0.7, 0.14], [0.5, 0.12], [0.38, 0.08]];
const labelChroma = { gray: 0.06, yellow: 0.9 };
// Owner-chosen priority colours (24 Sep 2026), kept exactly, text included.
const labelOverrides = {
  'red-3': ['#db5c5c', '#fff3f4'],
  'pink-3': ['#ee4ba7', '#330920'],
  'yellow-2': ['#f5d273', '#473a27'],
  'green-1': ['#b8e7bc', '#375239'],
  'gray-4': ['#5a5d63', '#f0f1f2'],
};

function hexToOklch(hx) {
  const lin = [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return Object.assign(new String(hx), { oklch: `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${Math.round(h)})` });
}

export function buildLabels() {
  const out = {};
  for (const [family, h] of Object.entries(labelFamilies)) {
    const shades = labelSteps.map(([L, C]) => hex(L, C * (labelChroma[family] ?? 1), h));
    labelSteps.forEach((_, i) => {
      const name = `${family}-${i + 1}`;
      const override = labelOverrides[name];
      const bg = override ? hexToOklch(override[0]) : shades[i];
      const dark = hex(0.28, 0.06 * (labelChroma[family] ?? 1), h);
      const light = hex(0.97, 0.015 * (labelChroma[family] ?? 1), h);
      const fg = override ? hexToOklch(override[1]) : contrast(dark, bg) >= contrast(light, bg) ? dark : light;
      const solid = {};
      for (const theme of ['light', 'dark']) {
        const order = [...shades.keys()].sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
        const pick = order.find(j => contrast(shades[j], surface[theme]) >= 3) ?? order[0];
        solid[theme] = pick === i ? bg : shades[pick];
      }
      out[name] = { bg, fg, solid };
    });
  }
  return out;
}

export function labelCss() {
  const labels = buildLabels();
  const names = Object.keys(labels);
  const root = names.map(n => `  --label-${n}-bg: ${labels[n].bg.oklch}; --label-${n}-fg: ${labels[n].fg.oklch}; --label-${n}-solid: ${labels[n].solid.light.oklch};`);
  const dark = names.map(n => `--label-${n}-solid: ${labels[n].solid.dark.oklch};`);
  const classes = names.map(n => `.l-${n} { --c-bg: var(--label-${n}-bg); --c-fg: var(--label-${n}-fg); --c-solid: var(--label-${n}-solid); }`);
  return [
    ':root {',
    ...root,
    '}',
    ':root[data-theme="dark"] {',
    `  ${dark.join(' ')}`,
    '}',
    '@media (prefers-color-scheme: dark) {',
    `  :root:not([data-theme="light"]) { ${dark.join(' ')} }`,
    '}',
    ...classes,
  ].join('\n');
}

if (process.argv.includes('--labels')) {
  const labels = buildLabels();
  console.log('Label contrast (fg on bg ≥ 4.5 · solid on surface ≥ 3)');
  for (const [n, t] of Object.entries(labels)) {
    const flag = contrast(t.fg, t.bg) < 4.5 ? '  < 4.5' : '';
    console.log(n.padEnd(9), String(t.bg), 'fg/bg', contrast(t.fg, t.bg), ' solid L/D', contrast(t.solid.light, surface.light), contrast(t.solid.dark, surface.dark), flag);
  }
  if (process.argv.includes('--write')) {
    const fs = await import('node:fs');
    const file = new URL('../tokens.css', import.meta.url);
    const css = fs.readFileSync(file, 'utf8');
    const start = '/* ---- label colours: generated by palette.mjs --labels --write ---- */';
    const end = '/* ---- end label colours ---- */';
    const block = `${start}\n${labelCss()}\n${end}`;
    const next = css.includes(start)
      ? css.replace(new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), block)
      : css.replace('@media (prefers-reduced-motion: reduce)', `${block}\n\n@media (prefers-reduced-motion: reduce)`);
    fs.writeFileSync(file, next);
    console.log('tokens.css updated');
  }
}

// ---- project marks ---------------------------------------------------------
// A project mark is an SVG the API renders, so it cannot read tokens.css. White initials
// on every hue: WCAG 2 ratios overrate dark text on mid-tone saturated fills, so the
// background is the hue's light solid, deepened until white clears APCA Lc 75 at ~11px.
const markText = '#ffffff';
const MARK_MIN_LC = 75;
function apcaLc(text, bg) {
  const y = hx => {
    const [r, g, b] = [1, 3, 5].map(i => (parseInt(hx.slice(i, i + 2), 16) / 255) ** 2.4);
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v > 0.022 ? v : v + (0.022 - v) ** 1.414;
  };
  const [t, b] = [y(text), y(bg)];
  const s = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14;
  return Math.abs(s) < 0.1 ? 0 : Math.abs(s) * 100 - 2.7;
}
export function buildMarks() {
  return Object.fromEntries(
    Object.entries(hues).map(([name, h]) => {
      const C = roles.light.solid[1] * (chromaScale[name] ?? 1);
      let L = solidL.light[name];
      let bg = hex(L, C, h);
      while (apcaLc(markText, String(bg)) < MARK_MIN_LC) bg = hex((L -= 0.005), C, h);
      return [name, { bg, text: markText }];
    }),
  );
}

export function markCss() {
  const marks = buildMarks();
  return [
    ':root {',
    `  --mark-text: oklch(1 0 0);`,
    ...Object.entries(marks).map(([n, m]) => `  --mark-${n}: ${m.bg.oklch};`),
    '}',
    ...Object.keys(marks).map(n => `.c-${n} { --c-mark: var(--mark-${n}); }`),
  ].join('\n');
}

if (process.argv.includes('--marks')) {
  const marks = buildMarks();
  console.log('Project marks (white text on background)');
  for (const [n, m] of Object.entries(marks)) console.log(n.padEnd(7), String(m.bg), 'APCA Lc', apcaLc(m.text, String(m.bg)).toFixed(0), ' WCAG', contrast(m.text, m.bg));
  if (process.argv.includes('--write')) {
    const fs = await import('node:fs');
    const api = new URL('../../apps/api/src/config/project-mark-colors.ts', import.meta.url);
    const rows = Object.entries(marks).map(([n, m]) => `  ${n}: { background: '${m.bg.slice(1)}', text: '${m.text.slice(1)}' },`);
    fs.writeFileSync(
      api,
      [
        '// Generated by design/scripts/palette.mjs --marks --write. Edit the script, not the hex.',
        "import type { PaletteHue } from '@nothingleft/types';",
        '',
        'export const PROJECT_MARK_COLORS: Record<PaletteHue, { background: string; text: string }> = {',
        ...rows,
        '};',
        '',
      ].join('\n'),
    );
    const file = new URL('../tokens.css', import.meta.url);
    const css = fs.readFileSync(file, 'utf8');
    const start = '/* ---- project marks: generated by palette.mjs --marks --write ---- */';
    const end = '/* ---- end project marks ---- */';
    const block = `${start}\n${markCss()}\n${end}`;
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = css.includes(start)
      ? css.replace(new RegExp(`${esc(start)}[\\s\\S]*?${esc(end)}`), block)
      : css.replace('@media (prefers-reduced-motion: reduce)', `${block}\n\n@media (prefers-reduced-motion: reduce)`);
    fs.writeFileSync(file, next);
    console.log('project-mark-colors.ts and tokens.css updated');
  }
}
