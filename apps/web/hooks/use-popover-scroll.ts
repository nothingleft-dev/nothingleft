'use client';

import { useEffect } from 'react';

const POPPER = '[data-radix-popper-content-wrapper]';

/**
 * An open dialog locks scrolling by dropping wheel and touch events that reach the document
 * from outside it, and a picker's list is portaled outside it — so the list would only scroll
 * by dragging its bar. Stopping those events at the window, for targets inside a popper,
 * means the lock never sees them; the browser's own scrolling is untouched.
 */
export function usePopoverScrollInDialogs() {
  useEffect(() => {
    const release = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(POPPER)) event.stopPropagation();
    };
    window.addEventListener('wheel', release, { capture: true });
    window.addEventListener('touchmove', release, { capture: true });
    return () => {
      window.removeEventListener('wheel', release, { capture: true });
      window.removeEventListener('touchmove', release, { capture: true });
    };
  }, []);
}
