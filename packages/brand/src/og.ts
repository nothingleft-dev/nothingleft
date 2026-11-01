import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARK_BARS,
  MARK_LAST_BAR,
  MARK_VIEWBOX,
  WORDMARK_LETTERS,
  WORDMARK_RING,
  WORDMARK_UNDERLINE,
  WORDMARK_VIEWBOX,
} from './brand';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Satori takes a React-shaped element tree; these helpers build one without JSX.
export type Style = Record<string, string | number>;

export interface OgNode {
  type: string;
  props: { style?: Style; children?: OgChild | OgChild[]; src?: string; width?: number; height?: number };
}
export type OgChild = OgNode | string | false | null | undefined;

export const el = (type: string, style: Style, ...children: OgChild[]): OgNode => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});

// Satori lays out every element with more than one child as a flex container, so say so.
export const box = (style: Style, ...children: OgChild[]) => el('div', { display: 'flex', ...style }, ...children);
export const row = (style: Style, ...children: OgChild[]) =>
  box({ flexDirection: 'row', alignItems: 'center', ...style }, ...children);
export const col = (style: Style, ...children: OgChild[]) => box({ flexDirection: 'column', ...style }, ...children);
export const text = (style: Style, content: string) => el('div', { display: 'flex', ...style }, content);

export const svgImage = (svg: string, width: number, height: number): OgNode => ({
  type: 'img',
  props: { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width, height },
});

// The sentence's last mark is the brand's amber full stop. A block with an inline span wraps as prose,
// which needs a Satori newer than the copy bundled in next/og; there, lay the lines out yourself.
export const sentence = (content: string, end: string, amber: string, style: Style) =>
  el('div', { display: 'block', fontWeight: 600, ...style }, content, el('span', { color: amber }, end));

export const markSvg = (ink: string, amber: string, opts: { stretch?: boolean } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}"${opts.stretch ? ' preserveAspectRatio="none"' : ''}>` +
  MARK_BARS.map(points => `<polygon fill="${ink}" points="${points}"/>`).join('') +
  `<polygon fill="${amber}" points="${MARK_LAST_BAR}"/></svg>`;

export const mark = (size: number, ink: string, amber: string) => svgImage(markSvg(ink, amber), size, size);

// The wordmark viewBox is 303.17 × 60.47; the width follows from the height.
export const wordmark = (height: number, ink: string, amber: string) =>
  svgImage(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}"><path fill="${ink}" d="${WORDMARK_LETTERS}"/>` +
      `<circle fill="none" stroke="${amber}" cx="${WORDMARK_RING.cx}" cy="${WORDMARK_RING.cy}" r="${WORDMARK_RING.r}" stroke-width="${WORDMARK_RING.strokeWidth}"/>` +
      `<rect fill="${amber}" x="${WORDMARK_UNDERLINE.x}" y="${WORDMARK_UNDERLINE.y}" width="${WORDMARK_UNDERLINE.width}" height="${WORDMARK_UNDERLINE.height}" rx="${WORDMARK_UNDERLINE.rx}"/></svg>`,
    Math.round((height * 303.17) / 60.47),
    height,
  );

export const lockup = (size: number, ink: string, amber: string) =>
  row({ gap: size * 0.35 }, mark(size, ink, amber), wordmark(size * 0.75, ink, amber));

export interface OgFont {
  name: string;
  weight: 400 | 500 | 600 | 700;
  style: 'normal';
  data: Buffer;
}

const WEIGHTS = [400, 500, 600, 700] as const;

// Satori reads TTF and WOFF but not WOFF2, so the package ships fontsource's WOFF files.
export function ogFonts(fontsDir: string): OgFont[] {
  const font = (name: string, file: string, weight: OgFont['weight']): OgFont => ({
    name,
    weight,
    style: 'normal',
    data: readFileSync(join(fontsDir, `${file}-latin-${weight}-normal.woff`)),
  });
  return WEIGHTS.flatMap(weight => [font('Inter', 'inter', weight), font('JetBrains Mono', 'jetbrains-mono', weight)]);
}
