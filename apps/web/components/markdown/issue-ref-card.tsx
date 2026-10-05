'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { IssueRef } from '@nothingleft/types';
import { Popover, PopoverAnchor, PopoverContent } from '@components/ui/popover';
import { IssueKey } from '@components/issue-key';
import { StatusDot, TypeBadge } from '@components/issues/value-marks';

const OPEN_DELAY_MS = 350;
const CLOSE_DELAY_MS = 150;

interface Shown {
  ref: IssueRef;
  rect: DOMRect;
}

/** Delegated from the rendered markdown: one card for every `PROJ-123` link in the text. */
export function useIssueRefCard(byKey: ReadonlyMap<string, IssueRef>) {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const schedule = useCallback((fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onPointerOver = (event: SyntheticEvent) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-issue-key]');
    const ref = link ? byKey.get(link.dataset.issueKey ?? '') : undefined;
    if (!link || !ref) return;
    schedule(() => setShown({ ref, rect: link.getBoundingClientRect() }), OPEN_DELAY_MS);
  };
  const onPointerOut = (event: SyntheticEvent) => {
    if ((event.target as HTMLElement).closest('a[data-issue-key]')) schedule(() => setShown(null), CLOSE_DELAY_MS);
  };

  return {
    shown,
    onPointerOver,
    onPointerOut,
    keep: () => clearTimeout(timer.current),
    close: () => schedule(() => setShown(null), CLOSE_DELAY_MS),
    dismiss: () => setShown(null),
  };
}

export function IssueRefCard({ state }: { state: ReturnType<typeof useIssueRefCard> }) {
  const { shown } = state;
  const rect = shown?.rect;
  return (
    <Popover open={shown !== null} onOpenChange={open => (open ? null : state.dismiss())}>
      <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => rect ?? new DOMRect() } }} />
      {shown ? (
        <PopoverContent
          side="top"
          align="start"
          className="w-80 p-3"
          onOpenAutoFocus={e => e.preventDefault()}
          onCloseAutoFocus={e => e.preventDefault()}
          onMouseEnter={state.keep}
          onMouseLeave={state.close}
        >
          <div className="flex items-center gap-2">
            <TypeBadge type={shown.ref.type} />
            <IssueKey issueKey={shown.ref.key} resolved={shown.ref.resolved} />
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <StatusDot category={shown.ref.status.category} color={shown.ref.status.color} />
              {shown.ref.status.name}
            </span>
          </div>
          <p className={shown.ref.resolved ? 'mt-1.5 text-sm text-text-secondary' : 'mt-1.5 text-sm text-text'}>
            {shown.ref.title}
          </p>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
