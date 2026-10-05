'use client';

import { useEffect, useState } from 'react';
import type { MarkdownHeading } from '@components/markdown/markdown';
import { cn } from '@lib/utils';

const MIN_HEADINGS = 2;

/** Pinned beside the article on wide screens; the heading last scrolled past is marked. */
export function ArticleToc({ headings }: { headings: readonly MarkdownHeading[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length < MIN_HEADINGS) return;
    const scroller = document.querySelector<HTMLElement>('[data-scroll-root]');
    if (!scroller) return;
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + 24;
      let current: string | null = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= top) current = h.id;
      }
      setActive(current);
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [headings]);

  if (headings.length < MIN_HEADINGS) return null;
  const top = Math.min(...headings.map(h => h.level));

  return (
    <nav aria-label="On this page" className="sticky top-0 max-h-[calc(100dvh-var(--topbar)-40px)] overflow-y-auto">
      <p className="mb-2 text-xs font-medium text-text-muted">On this page</p>
      <ul className="flex flex-col border-l">
        {headings.map(h => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={event => {
                event.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                window.history.replaceState(window.history.state, '', `#${h.id}`);
                setActive(h.id);
              }}
              aria-current={active === h.id ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l border-transparent py-1 pr-2 text-xs leading-4 text-text-secondary hover:text-text',
                active === h.id && 'border-text font-medium text-text',
              )}
              style={{ paddingLeft: 12 + (h.level - top) * 12 }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
