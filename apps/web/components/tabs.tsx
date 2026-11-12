'use client';

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@lib/utils';

export interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: ReactNode;
}

interface TabsProps<T extends string> {
  value: T;
  options: readonly TabOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** `section`: a heading row's strip (Activity, Links), which draws the rule itself. */
  size?: 'page' | 'section';
  className?: string;
}

/** A single row that scrolls sideways under an edge fade, keeping the selected tab in view. */
export function TabStrip({
  selected,
  className,
  children,
}: {
  selected: string;
  className?: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = scroller.current;
    const tab = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !tab) return;
    // Not scrollIntoView: that also scrolls the page to a strip further down it.
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < box.scrollLeft) box.scrollLeft = start - 24;
    else if (end > box.scrollLeft + box.clientWidth) box.scrollLeft = end - box.clientWidth + 24;
  }, [selected]);

  return (
    <div ref={scroller} data-tab-strip className={cn('scroll-fade-x relative flex min-w-0 overflow-x-auto', className)}>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'page',
  className,
}: TabsProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    const option = options[next];
    if (!option) return;
    event.preventDefault();
    tabs[next]?.focus();
    onChange(option.value);
  };

  const strip = (
    <TabStrip selected={value} className={cn('-mb-px self-stretch', size === 'section' && className)}>
      <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex items-stretch gap-1">
        {options.map(o => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cn(
                'group/tab relative flex shrink-0 items-center whitespace-nowrap text-text-secondary',
                selected &&
                  'text-text after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-text',
                size === 'page' ? 'text-sm' : 'text-xs',
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-sm group-hover/tab:bg-hover group-hover/tab:text-text',
                  size === 'page' ? 'h-control px-2.5' : 'h-control-sm px-2',
                  selected && 'font-medium',
                )}
              >
                {o.label}
                {o.count !== undefined && o.count !== null ? (
                  <span className="font-normal tabular text-text-secondary">{o.count}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </TabStrip>
  );

  if (size === 'section') return strip;
  return <div className={cn('flex h-11 border-b', className)}>{strip}</div>;
}
