import { LABEL_COLOR_FAMILIES, type LabelColor } from '@nothingleft/types';
import { cn } from '@lib/utils';

const SHADES = [1, 2, 3, 4, 5] as const;

interface LabelColorPickerProps {
  value: LabelColor;
  onChange: (value: LabelColor) => void;
}

/**
 * The 8 × 5 swatch grid for statuses, priorities and types. A swatch is picked by its
 * background; the text on it comes from tokens.css, so every choice stays readable.
 */
export function LabelColorPicker({ value, onChange }: LabelColorPickerProps) {
  return (
    <div role="radiogroup" aria-label="Colour" className="grid w-max grid-flow-col grid-rows-5 gap-1">
      {LABEL_COLOR_FAMILIES.flatMap(family =>
        SHADES.map(shade => {
          const name = `${family}-${shade}` as LabelColor;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === value}
              aria-label={name}
              title={name}
              onClick={() => onChange(name)}
              className={cn(
                `l-${name}`,
                'grid size-7 place-items-center rounded-sm bg-c-bg text-sm text-c-fg ring-offset-2 ring-offset-raised hover:ring-2 hover:ring-border-strong',
                name === value && 'ring-2 ring-ink hover:ring-ink',
              )}
            >
              a
            </button>
          );
        }),
      )}
    </div>
  );
}
