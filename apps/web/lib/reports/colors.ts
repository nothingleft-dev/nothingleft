import type { LabelColor, ReportPalette, StatusCategory } from '@nothingleft/types';

/** A chart mark's paint: a CSS colour, and whether it wears the cancelled hatch. */
export interface MarkPaint {
  fill: string;
  hatched: boolean;
  faded: boolean;
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

interface Paintable {
  series: number | null;
  color?: LabelColor | null;
  category?: StatusCategory | null;
}

export function markPaint(group: Paintable, palette: ReportPalette): MarkPaint {
  const category = group.category ?? null;
  const texture = { hatched: category === 'cancelled', faded: category === 'backlog' };
  if (palette === 'category' && category) return { fill: CATEGORY_FILL[category], ...texture };
  if (palette === 'label' && group.color) return { fill: `var(--label-${group.color}-solid)`, ...texture };
  if (group.series !== null) return { fill: `var(--chart-${group.series})`, hatched: false, faded: false };
  return { fill: OTHER_FILL, hatched: false, faded: false };
}

export const categoryFill = (category: StatusCategory) => CATEGORY_FILL[category];
