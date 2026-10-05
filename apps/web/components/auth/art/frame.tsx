import type { ReactNode } from 'react';

/**
 * Every panel illustration is one inline SVG on a 520×360 canvas, drawn entirely in
 * token colours so both themes and an accent-hue change come for free. No raster asset,
 * nothing to re-export when the palette moves.
 */
export function ArtFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 520 360" fill="none" role="img" aria-label={label} className="w-full max-w-[520px]">
      <defs>
        <pattern id="art-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--panel-dot)" />
        </pattern>
        <clipPath id="art-clip">
          <rect width="520" height="360" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#art-clip)">
        <rect width="520" height="360" fill="url(#art-grid)" />
        {children}
      </g>
    </svg>
  );
}

export const CARD = {
  fill: 'var(--panel-card)',
  stroke: 'var(--panel-line)',
  strokeWidth: 1,
} as const;

/** A line of body text, stood in for by a rounded bar. */
export function TextBar({
  x,
  y,
  w,
  h = 6,
  tone = 'muted',
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  tone?: 'strong' | 'muted' | 'faint';
}) {
  const fill =
    tone === 'strong' ? 'var(--panel-ink)' : tone === 'muted' ? 'var(--panel-ink-muted)' : 'var(--panel-ink-faint)';
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}
