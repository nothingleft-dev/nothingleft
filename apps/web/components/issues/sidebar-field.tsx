'use client';

import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { cn } from '@lib/utils';

interface SidebarFieldProps {
  label: string;
  children: ReactNode;
  /** Muted like an empty label, never blank — ui-conventions.md § Empty values. */
  empty?: boolean;
  mono?: boolean;
  /** A red asterisk after the label: the create form's required custom fields. */
  required?: boolean;
  aside?: ReactNode;
  /** The popover body. Absent or disabled renders a read-only row. */
  editor?: ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
}

const rowClass =
  'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-sm px-2 py-[7px] text-left';

function Body({
  label,
  children,
  empty,
  mono,
  required,
  aside,
  editable,
}: Omit<SidebarFieldProps, 'editor'> & { editable?: boolean }) {
  return (
    <>
      <span className="col-start-1 flex items-center gap-1.5 text-2xs text-text-muted">
        {label}
        {required ? (
          <span aria-label="required" className="-ml-1 text-danger-fg">
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
        className={cn(
          'col-start-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-text',
          empty && 'text-text-muted',
          mono && !empty && 'font-mono text-xs tabular',
          // The dotted rule under an editable value is the standing cue; hover adds the surface.
          editable &&
            'underline decoration-border-strong decoration-dotted underline-offset-[5px] group-hover/field:decoration-text-secondary',
        )}
      >
        {children}
      </span>
      {aside ? <span className="col-start-2 row-span-2 row-start-1 flex items-center">{aside}</span> : null}
    </>
  );
}

export function SidebarField(props: SidebarFieldProps) {
  const { label, editor, disabled, open, onOpenChange, contentClassName } = props;

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
          type="button"
          aria-label={`${label}: change`}
          className={cn(rowClass, 'group/field hover:bg-hover data-[state=open]:bg-hover')}
        >
          <Body {...props} editable />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="left"
        className={cn('w-[280px] max-w-[calc(100vw-32px)] p-0', contentClassName)}
      >
        {editor}
      </PopoverContent>
    </Popover>
  );
}
