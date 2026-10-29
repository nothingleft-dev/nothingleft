import Link from 'next/link';
import {
  MARK_BARS,
  MARK_LAST_BAR,
  WORDMARK_LETTERS,
  WORDMARK_RING,
  WORDMARK_UNDERLINE,
  WORDMARK_VIEWBOX,
} from '@nothingleft/brand';
import { cn } from '@lib/utils';

const BARS = [...MARK_BARS, MARK_LAST_BAR];

// Optical size: at 32px and below the bars sit on a 16px grid so their edges land on whole pixels.
const SMALL_BARS = ['3,1 15,1 13,3 1,3', '6,5 15,5 13,7 4,7', '9,9 15,9 13,11 7,11', '11,13 15,13 13,15 9,15'];
const SMALL_MAX_PX = 32;

export function BrandMark({
  size = 24,
  animated = false,
  className,
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  const small = size <= SMALL_MAX_PX;
  const bars = small ? SMALL_BARS : BARS;
  return (
    <svg
      width={size}
      height={size}
      viewBox={small ? '0 0 16 16' : '0 0 40 40'}
      className={cn('flex-none text-text', className)}
      aria-hidden
    >
      {bars.map((points, i) => (
        <polygon
          key={points}
          points={points}
          className={cn(
            i === bars.length - 1 ? 'fill-brand' : 'fill-current',
            animated &&
              'origin-right animate-[brand-burn_2.4s_var(--ease-in-out)_infinite] [transform-box:fill-box] motion-reduce:animate-none',
          )}
          style={animated ? { animationDelay: `${(bars.length - 1 - i) * 0.14}s` } : undefined}
        />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox={WORDMARK_VIEWBOX} className={cn('h-[20px] w-auto flex-none text-text', className)} aria-hidden>
      <path className="fill-current" d={WORDMARK_LETTERS} />
      <circle
        className="fill-none stroke-brand"
        cx={WORDMARK_RING.cx}
        cy={WORDMARK_RING.cy}
        r={WORDMARK_RING.r}
        strokeWidth={WORDMARK_RING.strokeWidth}
      />
      <rect
        className="fill-brand"
        x={WORDMARK_UNDERLINE.x}
        y={WORDMARK_UNDERLINE.y}
        width={WORDMARK_UNDERLINE.width}
        height={WORDMARK_UNDERLINE.height}
        rx={WORDMARK_UNDERLINE.rx}
      />
    </svg>
  );
}

export function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      className="flex h-10 items-center gap-2 rounded-sm px-1.5"
      title="Nothing Left"
      aria-label="Nothing Left"
    >
      <BrandMark size={22} />
      {collapsed ? null : <Wordmark />}
    </Link>
  );
}
