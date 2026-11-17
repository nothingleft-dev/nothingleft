'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@lib/utils';

let canvas: CanvasRenderingContext2D | null = null;

const splitExtension = (name: string): [string, string] => {
  const dot = name.lastIndexOf('.');
  return dot > 0 && name.length - dot <= 8 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
};

function fitName(name: string, el: HTMLElement): string {
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return name;
  const style = getComputedStyle(el);
  // Not `style.font`: it reads empty while font-feature-settings are set, and the canvas keeps its 10px default.
  canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // One pixel of slack: the canvas and the text layout round sub-pixel widths differently.
  const room = el.clientWidth - 1;
  const width = (text: string) => canvas!.measureText(text).width;
  if (width(name) <= room) return name;
  const [base, extension] = splitExtension(name);
  let low = 0;
  let high = base.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (width(`${base.slice(0, mid)}…${extension}`) <= room) low = mid;
    else high = mid - 1;
  }
  return `${base.slice(0, low)}…${extension}`;
}

/** A file name cut in the middle, so the extension stays readable: `rate-card-bef….png`. */
export function FileName({ name, className }: { name: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(name);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setShown(fitName(name, el));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return (
    <span ref={ref} className={cn('relative min-w-0 flex-1 overflow-hidden whitespace-nowrap', className)}>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
