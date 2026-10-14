import { PALETTE_HUES, type PaletteHue } from '@nothingleft/types';
import { cn } from '@lib/utils';

interface PaletteSwatchesProps {
  value: PaletteHue;
  onChange: (value: PaletteHue) => void;
  label?: string;
  disabled?: boolean;
}

/** Token names only — never a hex (ui-conventions.md § Colour). */
export function PaletteSwatches({ value, onChange, label = 'Colour', disabled }: PaletteSwatchesProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {PALETTE_HUES.map(hue => (
          <button
            key={hue}
            type="button"
            disabled={disabled}
            aria-label={hue}
            title={hue}
            aria-pressed={hue === value}
            onClick={() => onChange(hue)}
            className={cn(
              `c-${hue}`,
              'size-6 rounded-sm bg-c-mark ring-offset-2 ring-offset-surface transition-shadow disabled:opacity-50',
              hue === value && 'ring-2 ring-ink',
            )}
          />
        ))}
      </div>
    </div>
  );
}
