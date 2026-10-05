'use client';

import type { ReactNode } from 'react';
import type { MarkPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

export const HATCH_ID = 'report-hatch';
export const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 12 } as const;
export const LABEL_TICK = { fill: 'var(--text-secondary)', fontSize: 12 } as const;

/** The cancelled texture, at the 135° the status strip uses. Mount once inside each chart's SVG. */
export function HatchDefs() {
  return (
    <defs>
      <pattern id={HATCH_ID} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
        <rect width="5" height="5" fill="var(--palette-gray-bg)" />
        <rect width="2" height="5" fill="var(--palette-gray-solid)" />
      </pattern>
    </defs>
  );
}

export const svgFill = (paint: MarkPaint) => (paint.hatched ? `url(#${HATCH_ID})` : paint.fill);
export const svgOpacity = (paint: MarkPaint) => (paint.faded ? 0.4 : 1);

/** A swatch beside a label: identity is never colour alone, and text never wears the series colour. */
export function Swatch({ paint, shape = 'rect' }: { paint: MarkPaint; shape?: 'rect' | 'line' }) {
  return (
    <i
      aria-hidden
      className={cn('inline-block flex-none', shape === 'rect' ? 'size-2.5 rounded-[3px]' : 'h-0.5 w-3 rounded-full')}
      style={{
        background: paint.hatched
          ? 'repeating-linear-gradient(135deg, var(--palette-gray-solid) 0 2px, var(--palette-gray-bg) 2px 4px)'
          : paint.fill,
        opacity: paint.faded ? 0.4 : 1,
      }}
    />
  );
}

export interface TooltipRow {
  key: string;
  paint: MarkPaint;
  value: ReactNode;
  label: string;
}

/** Values lead, names follow; each row keyed by a short stroke of its series. */
export function ChartTooltipBody({
  title,
  rows,
  note,
}: {
  title?: string;
  rows: readonly TooltipRow[];
  note?: string;
}) {
  return (
    <div className="min-w-40 rounded-md border bg-raised px-3 py-2 text-xs shadow-(--shadow-popover)">
      {title ? <p className="mb-1.5 font-medium text-text">{title}</p> : null}
      <ul className="flex flex-col gap-1">
        {rows.map(row => (
          <li key={row.key} className="flex items-center gap-2">
            <Swatch paint={row.paint} shape="line" />
            <span className="font-semibold text-text tabular">{row.value}</span>
            <span className="text-text-secondary">{row.label}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-1.5 text-text-secondary">{note}</p> : null}
    </div>
  );
}

export function ChartLegend({
  items,
}: {
  items: readonly { key: string; label: string; paint: MarkPaint; shape?: 'rect' | 'line' }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map(item => (
        <li key={item.key} className="inline-flex items-center gap-1.5">
          <Swatch paint={item.paint} shape={item.shape} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A category label on one line, shortened; the tooltip and the table carry the whole name. */
export function CategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--text-secondary)" fontSize={12}>
      {truncate(payload?.value ?? '', 26)}
    </text>
  );
}

/** Round ticks for a duration axis: 15m, 30m, 1h … a working day, a week. */
export function durationTicks(max: number, workdayMinutes: number): number[] {
  const steps = [
    15,
    30,
    60,
    120,
    240,
    workdayMinutes,
    workdayMinutes * 2,
    workdayMinutes * 5,
    workdayMinutes * 10,
    workdayMinutes * 20,
  ];
  const step = steps.find(s => Math.ceil(max / s) <= 5) ?? Math.ceil(max / 5);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Round ticks for the axis — 0 / 20 / 40 / 60 rather than stopping at 58.3. */
export function niceTicks(value: number): number[] {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => Math.ceil(value / s) <= 5)!;
  return Array.from({ length: Math.ceil(value / step) + 1 }, (_, i) => i * step);
}
