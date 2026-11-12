'use client';

import type { ComponentProps } from 'react';
import {
  TooltipContent as TooltipContentBase,
  TooltipProvider as TooltipProviderBase,
  TooltipTrigger as TooltipTriggerBase,
} from '@components/ui/tooltip';

export { Tooltip } from '@components/ui/tooltip';

let lastInputWasKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    event => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) lastInputWasKeyboard = true;
    },
    true,
  );
  window.addEventListener('pointerdown', () => (lastInputWasKeyboard = false), true);
}

export function TooltipProvider({
  delayDuration = 400,
  skipDelayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipProviderBase>) {
  return <TooltipProviderBase delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}

/** Opens on keyboard focus only: a dialog or sheet that focuses its first control must not pop a tooltip over itself. */
export function TooltipTrigger({ onFocus, ...props }: ComponentProps<typeof TooltipTriggerBase>) {
  return (
    <TooltipTriggerBase
      onFocus={event => {
        onFocus?.(event);
        if (!lastInputWasKeyboard || !event.currentTarget.matches(':focus-visible')) event.preventDefault();
      }}
      {...props}
    />
  );
}

export function TooltipContent({
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof TooltipContentBase>) {
  return <TooltipContentBase sideOffset={sideOffset} collisionPadding={collisionPadding} {...props} />;
}
