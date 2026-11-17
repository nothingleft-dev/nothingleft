'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Whether a sideways scroller has content hidden past its start and past its end. */
export function useScrollEdges<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft > 0;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);
  return { ref, edges, measure };
}

/** A soft shade on the inner side of a sticky column while content is scrolled under it. */
export const EDGE_START =
  "after:pointer-events-none after:absolute after:inset-y-0 after:-right-2 after:w-2 after:bg-linear-to-r after:from-[color-mix(in_oklab,var(--text)_10%,transparent)] after:to-transparent after:content-['']";
export const EDGE_END =
  "before:pointer-events-none before:absolute before:inset-y-0 before:-left-2 before:w-2 before:bg-linear-to-l before:from-[color-mix(in_oklab,var(--text)_10%,transparent)] before:to-transparent before:content-['']";

/** The same shade laid over a scroller's own edge, where there is no sticky column to carry it. */
export const EDGE_FADE_START =
  'pointer-events-none absolute inset-y-0 left-0 w-3 bg-linear-to-r from-[color-mix(in_oklab,var(--text)_10%,transparent)] to-transparent';
export const EDGE_FADE_END =
  'pointer-events-none absolute inset-y-0 right-0 w-3 bg-linear-to-l from-[color-mix(in_oklab,var(--text)_10%,transparent)] to-transparent';
