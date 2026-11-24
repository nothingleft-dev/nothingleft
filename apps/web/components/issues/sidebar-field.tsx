'use client';

import { Children, Fragment, isValidElement, useState, type ReactNode } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { useMediaQuery } from '@hooks/use-media-query';
import { cn } from '@lib/utils';

interface SidebarFieldProps {
  label: string;
  /** Shown in place of the label where the label itself carries the state, as `Overdue` does on a due date. */
  labelAs?: ReactNode;
  children: ReactNode;
  /** Muted like an empty label, never blank — ui-conventions.md § Empty values. */
  empty?: boolean;
  mono?: boolean;
  /** An asterisk after the label: the create form's required custom fields; red once a create left it empty. */
  required?: boolean;
  invalid?: boolean;
  aside?: ReactNode;
  /** The popover body. Absent or disabled renders a read-only row. */
  editor?: ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
  /** `open`: the popover only shows more (the watchers), so the value wears a chevron, not the edit cue. */
  cue?: 'edit' | 'open';
  /** `strip`: one cell of the key-field strip under the title, its mark inline rather than aside. */
  variant?: 'rail' | 'strip';
}

const EMPTY_FIGURE = '?';

/**
 * The dotted rule under an editable value's words, its standing cue (design § 8b): on the text only, so
 * letter badges, dots, avatars and a bare `?` carry no stub. Hover darkens it.
 */
export const FIELD_TEXT = '[[data-editable]_&]:edit-cue group-hover/field:decoration-text-secondary';

/** The same rule for the name beside a person's avatar (`PersonName`'s second child). */
export const FIELD_PERSON_TEXT =
  '[[data-editable]_&>:nth-child(2)]:edit-cue group-hover/field:[&>:nth-child(2)]:decoration-text-secondary';

function underlineText(children: ReactNode): ReactNode {
  return Children.map(children, child => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return underlineText(child.props.children);
    }
    if ((typeof child === 'string' && child !== EMPTY_FIGURE) || typeof child === 'number') {
      return <span className={FIELD_TEXT}>{child}</span>;
    }
    return child;
  });
}

const ROW_CLASS = {
  rail: 'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-sm px-2 py-[7px] text-left',
  strip: 'grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-y-0.5 px-3 py-2 text-left',
};

function Body({
  label,
  labelAs,
  children,
  empty,
  mono,
  required,
  invalid,
  aside,
  editable,
  opens,
}: Omit<SidebarFieldProps, 'editor'> & { editable?: boolean; opens?: boolean }) {
  return (
    <>
      <span
        className={cn('col-start-1 flex items-center gap-1.5 text-2xs text-text-muted', invalid && 'text-danger-fg')}
      >
        {labelAs ?? label}
        {required ? (
          <span aria-label="required" className="-ml-1">
            *
          </span>
        ) : null}
        {editable ? (
          <Pencil
            aria-hidden
            className="size-2.5 opacity-0 transition-opacity duration-(--dur-fast) group-hover/field:opacity-100 group-focus-visible/field:opacity-100 group-data-[state=open]/field:opacity-100"
          />
        ) : null}
      </span>
      <span
        data-editable={editable || undefined}
        className={cn(
          'col-start-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-text',
          empty && 'text-text-muted',
          mono && !empty && 'font-mono text-xs tabular',
        )}
      >
        {underlineText(children)}
        {opens ? <ChevronDown aria-hidden className="size-3 text-text-muted group-hover/field:text-text" /> : null}
      </span>
      {aside ? <span className="col-start-2 row-start-1 -my-1 flex items-center">{aside}</span> : null}
    </>
  );
}

/** The same rule for a name drawn without its avatar (`PersonName`'s first child), as after an assignee stack. */
export const FIELD_NAME_TEXT =
  '[[data-editable]_&>:first-child]:edit-cue group-hover/field:[&>:first-child]:decoration-text-secondary';

/** Rail editors open below their row: to the left they would cover the key-field strip. */
export const useRailPopoverAlign = () => (useMediaQuery('(min-width: 1100px)') ? 'end' : 'start');

export function SidebarField(props: SidebarFieldProps) {
  const { label, editor, disabled, open, onOpenChange, contentClassName, cue = 'edit', variant = 'rail' } = props;
  const railAlign = useRailPopoverAlign();
  const strip = variant === 'strip';
  const rowClass = ROW_CLASS[variant];
  // A strip picker stays inside the issue column: the last cells' would otherwise open across the rail.
  const [bounds, setBounds] = useState<Element | null>(null);

  if (!editor || disabled) {
    return (
      <div className={rowClass} aria-label={label}>
        <Body {...props} />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={strip ? node => setBounds(node?.closest('[data-popover-bounds]') ?? null) : undefined}
          type="button"
          aria-label={cue === 'open' ? `${label}: show` : `${label}: change`}
          className={cn(rowClass, 'group/field hover:bg-hover data-[state=open]:bg-hover')}
        >
          <Body {...props} editable={cue === 'edit'} opens={cue === 'open'} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={strip ? 'start' : railAlign}
        side="bottom"
        collisionBoundary={bounds ?? []}
        collisionPadding={bounds ? { top: 16, bottom: 16, left: 0, right: 0 } : 16}
        className={cn('w-[280px] max-w-[calc(100vw-32px)] p-0', contentClassName)}
      >
        {editor}
      </PopoverContent>
    </Popover>
  );
}
