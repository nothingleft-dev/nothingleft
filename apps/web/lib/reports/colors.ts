import type { LabelColor, PaletteHue, ReportPalette, StatusCategory } from '@nothingleft/types';

/** A chart mark's paint: a CSS colour, and whether it wears the cancelled hatch. */
export interface MarkPaint {
  fill: string;
  hatched: boolean;
  faded: boolean;
  /** Drawn in stripes of this hue: a project whose plain colours are all taken in the chart. */
  stripe?: PaletteHue;
}

// DESIGN-SYSTEM § 3.4: categories separate by texture — backlog faded, cancelled hatched, both gray.
const CATEGORY_FILL: Record<StatusCategory, string> = {
  backlog: 'var(--palette-gray-solid)',
  unstarted: 'var(--palette-gray-solid)',
  started: 'var(--palette-amber-solid)',
  done: 'var(--palette-green-solid)',
  cancelled: 'var(--palette-gray-solid)',
};

export const OTHER_FILL = 'var(--border-strong)';
/** The matrix's shade ramp and the burndown's non-working day: values live in globals.css. */
export const HEAT_FILLS = [1, 2, 3, 4, 5].map(n => `var(--heat-${n})`);
export const OFF_DAY_FILL = 'var(--chart-off-day)';
/** Unassigned, No tag: an absence is never a hue, so it reads the same in every report. */
export const NONE_FILL = 'var(--palette-gray-solid)';

interface Paintable {
  value?: string | null;
  other?: boolean;
  series: number | null;
  color?: LabelColor | null;
  category?: StatusCategory | null;
  hue?: PaletteHue | null;
  hue_striped?: boolean;
}

/** A project's own colour in a chart, the solid step its mark is drawn from. */
const hueFill = (hue: PaletteHue) => `var(--palette-${hue}-solid)`;

export function markPaint(group: Paintable, palette: ReportPalette): MarkPaint {
  const category = group.category ?? null;
  const texture = { hatched: category === 'cancelled', faded: category === 'backlog' };
  if (palette === 'category' && category) return { fill: CATEGORY_FILL[category], ...texture };
  if (palette === 'label' && group.color) return { fill: `var(--label-${group.color}-solid)`, ...texture };
  if (palette === 'project' && group.hue) {
    return {
      fill: hueFill(group.hue),
      hatched: false,
      faded: false,
      ...(group.hue_striped ? { stripe: group.hue } : {}),
    };
  }
  if (group.value === null && !group.other) return { fill: NONE_FILL, hatched: false, faded: false };
  if (group.series !== null) return { fill: `var(--chart-${group.series})`, hatched: false, faded: false };
  return { fill: OTHER_FILL, hatched: false, faded: false };
}

export const categoryFill = (category: StatusCategory) => CATEGORY_FILL[category];
