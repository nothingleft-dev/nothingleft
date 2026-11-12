'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ComponentProps } from 'react';
import { cn } from '@lib/utils';

interface TitleInputProps extends Omit<ComponentProps<'textarea'>, 'value' | 'onChange' | 'rows'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter never adds a line: a title is one line that wraps. Without a handler it submits the form, as an input would. */
  onEnter?: () => void;
}

/**
 * A one-line title that wraps instead of scrolling sideways, so its start is never cut off.
 */
export const TitleInput = forwardRef<HTMLTextAreaElement, TitleInputProps>(function TitleInput(
  { value, onValueChange, onEnter, onKeyDown, className, ...props },
  ref,
) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => area.current!, []);

  // field-sizing does the growing where it is supported; elsewhere the height follows the text.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={area}
      rows={1}
      value={value}
      onChange={e => onValueChange(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (onEnter) onEnter();
          else e.currentTarget.form?.requestSubmit();
        }
        onKeyDown?.(e);
      }}
      className={cn('field-sizing-content resize-none overflow-hidden', className)}
      {...props}
    />
  );
});
