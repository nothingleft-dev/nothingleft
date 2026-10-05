'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import type { Suggestion } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { useClearRecentSearches, useSuggestions } from '@hooks/use-issue-search';
import { useDebounced } from '@hooks/use-debounced';
import type { SuggestKind } from '@lib/api/search';
import { highlightQuery } from '@lib/issue-list/highlight';
import { cn } from '@lib/utils';

export interface QueryProblem {
  message: string;
  /** Characters of the visible text at fault, when the API pointed inside it. */
  span: { start: number; end: number } | null;
  validValues: readonly string[];
}

interface QueryBarProps {
  value: string;
  onCommit: (q: string) => void;
  problem: QueryProblem | null;
  /** Prepended, unseen, to what the API sees: `#Star` on /starred. */
  base?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSaveView?: () => void;
  saveLabel?: string;
  /** Which vocabulary autocomplete speaks: the issue query language or the knowledge base's. */
  kind?: SuggestKind;
  label?: string;
}

const GROUP_LABEL: Record<Suggestion['kind'], string> = {
  attribute: 'Attributes',
  operator: 'Operators',
  value: 'Values',
  saved_search: 'Saved searches',
  recent_search: 'Recent',
};
const GROUP_ORDER: Suggestion['kind'][] = ['attribute', 'operator', 'value', 'saved_search', 'recent_search'];

const monoText = 'font-mono text-xs leading-none tabular';

export function QueryBar({
  value,
  onCommit,
  problem,
  base = '',
  placeholder = 'Search or query · assignee: me #Unresolved',
  autoFocus = false,
  onSaveView,
  saveLabel = 'Save view',
  kind = 'issues',
  label = 'Search issues',
}: QueryBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value);
  const [caret, setCaret] = useState(value.length);
  // Where the caret stood when the text last changed: the only position suggestions are asked for.
  // Clicking or arrowing around the bar must not cost a round trip.
  const [askCaret, setAskCaret] = useState(value.length);
  const [seenValue, setSeenValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const clearRecent = useClearRecentSearches();

  // A tab click, a back button or a link changes the committed query under the bar.
  if (value !== seenValue) {
    setSeenValue(value);
    setText(value);
    setCaret(value.length);
    setAskCaret(value.length);
  }

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const full = base ? `${base} ${text}` : text;
  const offset = base ? base.length + 1 : 0;
  // One request per pause in typing, not per keystroke: a round trip costs more than the wait.
  const debounceKey = `${askCaret + offset}\u0000${full}`;
  const settledKey = useDebounced(debounceKey, 400);
  const debounced = useMemo(() => {
    const [at, ...rest] = settledKey.split('\u0000');
    return { caret: Number(at), full: rest.join('\u0000') };
  }, [settledKey]);
  const open = focused && !dismissed;
  const suggestions = useSuggestions(debounced.full, debounced.caret, open, kind);
  const items = useMemo(() => suggestions.data ?? [], [suggestions.data]);

  const groups = useMemo(() => {
    const byKind = new Map<Suggestion['kind'], { item: Suggestion; index: number }[]>();
    items.forEach((item, index) => {
      const list = byKind.get(item.kind) ?? [];
      list.push({ item, index });
      byKind.set(item.kind, list);
    });
    return GROUP_ORDER.filter(k => byKind.has(k)).map(k => ({ kind: k, label: GROUP_LABEL[k], items: byKind.get(k)! }));
  }, [items]);

  const apply = (suggestion: Suggestion) => {
    // Spans come back against the full text; the base is invisible here.
    const start = Math.max(0, suggestion.replace.start - offset);
    const end = Math.max(start, suggestion.replace.end - offset);
    const next = text.slice(0, start) + suggestion.insert + text.slice(end);
    const position = start + suggestion.insert.length;
    setText(next);
    setCaret(position);
    setAskCaret(position);
    setActive(-1);
    setDismissed(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(position, position);
    });
  };

  const commit = () => {
    setDismissed(true);
    setActive(-1);
    onCommit(text.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' && !event.shiftKey && open && items.length > 0) {
      event.preventDefault();
      apply(items[Math.max(0, active)]!);
      return;
    }
    if (event.key === 'ArrowDown' && open && items.length > 0) {
      event.preventDefault();
      setActive(i => (i + 1) % items.length);
      return;
    }
    if (event.key === 'ArrowUp' && open && items.length > 0) {
      event.preventDefault();
      setActive(i => (i <= 0 ? items.length - 1 : i - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active >= 0 && items[active]) apply(items[active]);
      else commit();
      return;
    }
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setDismissed(true);
      } else {
        inputRef.current?.blur();
      }
    }
  };

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? text.length);

  // The mirror carries the colour; the input carries the caret. They scroll together.
  useLayoutEffect(() => {
    if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
  });

  const segments = useMemo(() => highlightQuery(text, problem?.span ?? null), [text, problem]);
  const replaceSpan = (replacement: string) => {
    if (!problem?.span) return;
    const next = text.slice(0, problem.span.start) + replacement + text.slice(problem.span.end);
    setText(next);
    onCommit(next.trim());
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        data-query-bar
        className={cn(
          'relative flex h-control-lg items-center gap-2 rounded-sm border border-border-strong bg-surface pr-1.5 pl-3',
          'focus-within:shadow-(--focus-ring)',
          problem && 'border-danger-fg',
        )}
      >
        <Search className="size-icon-sm flex-none text-text-muted" />
        <div className="relative h-full min-w-0 flex-1">
          <div
            ref={mirrorRef}
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre',
              monoText,
            )}
          >
            {text === '' ? (
              <span className="text-text-muted">{placeholder}</span>
            ) : (
              segments.map((segment, i) => (
                <span
                  key={i}
                  className={cn(
                    segment.kind === 'attribute' ? 'text-text-secondary' : 'text-text',
                    segment.error &&
                      'underline decoration-danger-fg decoration-wavy decoration-[1.5px] underline-offset-[3px]',
                  )}
                >
                  {segment.text}
                </span>
              ))
            )}
          </div>
          <input
            ref={inputRef}
            value={text}
            onChange={event => {
              setText(event.target.value);
              const at = event.target.selectionStart ?? event.target.value.length;
              setCaret(at);
              setAskCaret(at);
              setActive(-1);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onSelect={syncCaret}
            onScroll={() => {
              if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
            }}
            onFocus={() => {
              setFocused(true);
              setDismissed(false);
              setAskCaret(inputRef.current?.selectionStart ?? text.length);
            }}
            onBlur={() => {
              setFocused(false);
              setActive(-1);
            }}
            role="combobox"
            aria-label={label}
            aria-expanded={open && items.length > 0}
            aria-controls="query-suggestions"
            aria-autocomplete="list"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'query-problem' : undefined}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              // The ring belongs to the bar (focus-within), not to the invisible input inside it.
              'relative h-full w-full bg-transparent text-transparent caret-text outline-none selection:bg-brand/30 focus-visible:shadow-none',
              monoText,
            )}
          />
        </div>
        <Kbd className="max-md:hidden">/</Kbd>
        {onSaveView ? (
          <Button type="button" variant="ghost" size="xs" className="text-text-secondary" onClick={onSaveView}>
            {saveLabel}
          </Button>
        ) : null}

        {open && (items.length > 0 || suggestions.isPending) ? (
          <div
            id="query-suggestions"
            role="listbox"
            // Mouse down would blur the input and close the list before the click lands.
            onMouseDown={event => event.preventDefault()}
            className="absolute inset-x-[-1px] top-full z-40 mt-1 max-h-[min(420px,60vh)] overflow-y-auto rounded-lg border bg-raised py-1 shadow-popover"
          >
            {groups.map(group => (
              <div key={group.kind}>
                <div className="flex items-center px-3 pt-1.5 pb-0.5 text-2xs font-medium text-text-muted">
                  <span className="flex-1">{group.label}</span>
                  {group.kind === 'recent_search' ? (
                    <button
                      type="button"
                      className="rounded-xs text-2xs font-normal text-text-muted hover:text-text"
                      onClick={() => clearRecent.mutate()}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {group.items.map(({ item, index }) => (
                  <div
                    key={`${item.kind}-${item.insert}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => apply(item)}
                    className={cn(
                      'grid h-[30px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-3',
                      (index === active || (active === -1 && index === 0)) && 'bg-hover',
                    )}
                  >
                    <span className={cn('truncate text-text', monoText)}>{item.label}</span>
                    {item.description ? (
                      <span className="truncate text-2xs text-text-muted">{item.description}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-1 flex items-center gap-3 border-t px-3 pt-1.5 pb-0.5 text-2xs text-text-muted">
              <span>
                Press <Kbd className="h-4 min-w-4 text-[10px]">⇥</Kbd> to complete the first item
              </span>
              <span>
                <Kbd className="h-4 min-w-4 text-[10px]">↵</Kbd> runs the search
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {problem ? (
        <div
          id="query-problem"
          role="alert"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-danger-fg"
        >
          <span>{problem.message}</span>
          {problem.validValues.length > 0 && problem.span ? (
            <span className="flex flex-wrap items-center gap-1">
              {problem.validValues.slice(0, 8).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => replaceSpan(/\s/.test(v) ? `{${v}}` : v)}
                  className={cn(
                    'rounded-xs border bg-surface px-1.5 py-0.5 text-text-secondary hover:border-border-strong hover:text-text',
                    monoText,
                  )}
                >
                  {v}
                </button>
              ))}
              {problem.validValues.length > 8 ? (
                <span className="text-text-muted">+{problem.validValues.length - 8} more</span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
