'use client';

import { useEffect, useRef } from 'react';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
};

const ignored = (e: KeyboardEvent) =>
  e.metaKey ||
  e.ctrlKey ||
  e.altKey ||
  e.defaultPrevented ||
  isTyping(e.target) ||
  document.querySelector(':is([role="dialog"], [role="menu"])[data-state="open"]') !== null;

/** A bare single-key shortcut (ui-conventions.md § Keyboard): ignored while typing, in a dialog, or with a modifier. */
export function useShortcut(key: string, handler: () => void, enabled = true) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || ignored(e)) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, enabled]);
}

/** `first` then one of `handlers`' keys within `windowMs`: `g` then `i`. */
export function useSequenceShortcut(first: string, handlers: Record<string, () => void>, windowMs: number) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    let armedAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (ignored(e)) return;
      const second = latest.current[e.key];
      if (armedAt > 0 && Date.now() - armedAt <= windowMs && second) {
        armedAt = 0;
        e.preventDefault();
        second();
        return;
      }
      armedAt = e.key === first ? Date.now() : 0;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [first, windowMs]);
}
