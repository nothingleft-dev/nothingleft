'use client';

import type { ReactNode } from 'react';
import type { WorkCalendar } from '@nothingleft/format';
import { PALETTE_HUES, type PaletteHue } from '@nothingleft/types';
import { PersonMark, type DurationUnit, type PersonRef } from '@components/reports/report-bits';
import type { MarkPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

export const HATCH_ID = 'report-hatch';
export const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 12 } as const;
export const LABEL_TICK = { fill: 'var(--text-secondary)', fontSize: 12 } as const;

const stripeId = (hue: PaletteHue) => `report-stripe-${hue}`;

/**
 * The cancelled texture, at the 135° the status strip uses, and the striped project colours, at
 * 45° so they never read as cancelled. Mount once inside each chart's SVG.
 */
export function HatchDefs() {
  return (
    <defs>
      <pattern id={HATCH_ID} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
        <rect width="5" height="5" fill="var(--palette-gray-bg)" />
        <rect width="2" height="5" fill="var(--palette-gray-solid)" />
      </pattern>
      {PALETTE_HUES.map(hue => (
        <pattern
          key={hue}
          id={stripeId(hue)}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill={`var(--palette-${hue}-bg)`} />
          <rect width="3" height="6" fill={`var(--palette-${hue}-solid)`} />
        </pattern>
      ))}
    </defs>
  );
}

export const svgFill = (paint: MarkPaint) =>
  paint.hatched ? `url(#${HATCH_ID})` : paint.stripe ? `url(#${stripeId(paint.stripe)})` : paint.fill;
export const svgOpacity = (paint: MarkPaint) => (paint.faded ? 0.4 : 1);

/** A mark's paint as CSS, for marks drawn in HTML rather than SVG. */
export const cssPaint = (paint: MarkPaint) => ({
  background: paint.hatched
    ? 'repeating-linear-gradient(135deg, var(--palette-gray-solid) 0 2px, var(--palette-gray-bg) 2px 4px)'
    : paint.stripe
      ? `repeating-linear-gradient(45deg, var(--palette-${paint.stripe}-solid) 0 3px, var(--palette-${paint.stripe}-bg) 3px 6px)`
      : paint.fill,
  opacity: paint.faded ? 0.4 : 1,
});

/** A swatch beside a label: identity is never colour alone, and text never wears the series colour. */
export function Swatch({ paint, shape = 'rect' }: { paint: MarkPaint; shape?: 'rect' | 'line' }) {
  return (
    <i
      aria-hidden
      className={cn('inline-block flex-none', shape === 'rect' ? 'size-2.5 rounded-[3px]' : 'h-0.5 w-3 rounded-full')}
      style={cssPaint(paint)}
    />
  );
}

export interface TooltipRow {
  key: string;
  paint: MarkPaint;
  value: ReactNode;
  label: string;
  person?: PersonRef;
}

/** Values lead, names follow; each row keyed by a short stroke of its series. */
export function ChartTooltipBody({
  title,
  titlePerson,
  rows,
  note,
}: {
  title?: string;
  titlePerson?: PersonRef;
  rows: readonly TooltipRow[];
  note?: string;
}) {
  return (
    <div className="min-w-40 rounded-md border bg-raised px-3 py-2 text-xs shadow-(--shadow-popover)">
      {title ? (
        <p className="mb-1.5 flex items-center gap-1.5 font-medium text-text">
          {titlePerson ? <PersonMark name={title} {...titlePerson} small /> : null}
          {title}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {rows.map(row => (
          <li key={row.key} className="flex items-center gap-2">
            <Swatch paint={row.paint} shape="line" />
            <span className="font-semibold text-text tabular">{row.value}</span>
            {row.person ? <PersonMark name={row.label} {...row.person} small /> : null}
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
  items: readonly { key: string; label: string; paint: MarkPaint; shape?: 'rect' | 'line'; person?: PersonRef }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map(item => (
        <li key={item.key} className="inline-flex items-center gap-1.5">
          <Swatch paint={item.paint} shape={item.shape} />
          {item.person ? <PersonMark name={item.label} {...item.person} small /> : null}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * A category label on one line, shortened; the tooltip and the table carry the whole name. A person
 * wears their picture between the name and the axis.
 */
export function CategoryTick({
  x = 0,
  y = 0,
  payload,
  people,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  people?: ReadonlyMap<string, PersonRef>;
}) {
  const label = payload?.value ?? '';
  const person = people?.get(label);
  return (
    <g>
      <text x={person ? x - 24 : x} y={y} dy={4} textAnchor="end" fill="var(--text-secondary)" fontSize={12}>
        {truncate(label, person ? 23 : 26)}
      </text>
      {person ? (
        <foreignObject x={x - 20} y={y - 8} width={16} height={16}>
          <PersonMark name={label} {...person} small />
        </foreignObject>
      ) : null}
    </g>
  );
}

/** The people map a category tick reads: each person group's label to its picture. */
export const peopleByLabel = (
  groups: readonly { label: string; value: string | null; avatar_url: string | null; other?: boolean }[],
  people: boolean,
): ReadonlyMap<string, PersonRef> | undefined =>
  people
    ? new Map(groups.filter(g => !g.other).map(g => [g.label, { avatarUrl: g.avatar_url, nobody: g.value === null }]))
    : undefined;

/** Round ticks for a duration axis: 15m, 30m, 1h … a working day, a week, then whole weeks. */
export function durationTicks(max: number, calendar: WorkCalendar): number[] {
  const day = calendar.workdayMinutes;
  const week = day * calendar.workweekDays;
  if (max > week * 5) return niceTicks(max / week, [1, 2, 5, 10]).map(w => w * week);
  const step = [15, 30, 60, 120, 240, day, day * 2, week].find(s => Math.ceil(max / s) <= 5) ?? week;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Ticks in the unit the viewer reads: round hours or days, or round durations. */
export function unitTicks(max: number, unit: DurationUnit, calendar: WorkCalendar): number[] {
  const top = Math.max(max, 1);
  if (unit === 'hours') return niceTicks(top / 60).map(h => h * 60);
  if (unit === 'days') return niceTicks(top / calendar.workdayMinutes).map(d => d * calendar.workdayMinutes);
  return durationTicks(top, calendar);
}

/** Round ticks for the axis — 0 / 20 / 40 / 60 rather than stopping at 58.3. */
export function niceTicks(value: number, multiples: readonly number[] = [1, 2, 2.5, 5, 10]): number[] {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = multiples.map(m => m * magnitude).find(s => Math.ceil(value / s) <= 5) ?? magnitude * 10;
  return Array.from({ length: Math.ceil(value / step) + 1 }, (_, i) => i * step);
}
