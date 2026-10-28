import {
  MARK_BARS,
  MARK_LAST_BAR,
  MARK_VIEWBOX,
  WORDMARK_LETTERS,
  WORDMARK_RING,
  WORDMARK_UNDERLINE,
  WORDMARK_VIEWBOX,
} from '@lib/brand';
import { svgImage } from './node';

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
