'use client';

import { type ComponentProps, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@lib/utils';
import { Command, CommandItem } from '@components/ui/command';

/** A picker list whose keyboard highlight opens on the checked option rather than the first row. */
export function PickerCommand({ onKeyDown, onPointerMove, ...props }: ComponentProps<typeof Command>) {
  const ref = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const [value, setValue] = useState<string | undefined>(undefined);

  // Every render, until the user moves the highlight: the checked row can arrive after the list mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (touched.current) return;
    const checked = ref.current?.querySelector<HTMLElement>('[cmdk-item][data-checked="true"]');
    const next = checked?.getAttribute('data-value');
    if (!checked || !next || next === value) return;
    setValue(next);
    // After cmdk's own mount scroll, which still targets the first row; centred so the rows around it show.
    requestAnimationFrame(() => {
      const list = checked.closest<HTMLElement>('[cmdk-list]');
      if (!list) return;
      const box = list.getBoundingClientRect();
      const row = checked.getBoundingClientRect();
      list.scrollTop += row.top - box.top - (box.height - row.height) / 2;
    });
  });

  return (
    <Command
      ref={ref}
      value={value}
      onValueChange={setValue}
      onKeyDown={event => {
        touched.current = true;
        onKeyDown?.(event);
      }}
      onPointerMove={event => {
        touched.current = true;
        onPointerMove?.(event);
      }}
      {...props}
    />
  );
}

/** A picker row with its check in the trailing column, the same side in every picker. */
export function PickerItem({
  checked,
  checkClassName,
  children,
  ...props
}: ComponentProps<typeof CommandItem> & { checked: boolean; checkClassName?: string }) {
  return (
    <CommandItem data-checked={checked} {...props}>
      {children}
      <Check aria-hidden className={cn('ml-auto size-icon-sm flex-none', !checked && 'invisible', checkClassName)} />
    </CommandItem>
  );
}
