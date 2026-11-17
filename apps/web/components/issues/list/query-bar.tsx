'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CircleAlert, Search, X } from 'lucide-react';
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

// No ligatures: JetBrains Mono joins `#{` and `..` into glyphs that no longer read as the syntax.
const monoText = 'font-mono text-xs leading-none tabular [font-variant-ligatures:none]';

/** `Lead-in · example`: the lead-in is prose (Inter), only the example is a query (mono). */
const splitPlaceholder = (placeholder: string) => {
  const at = placeholder.lastIndexOf(' · ');
  return at < 0
    ? { lead: placeholder, example: '' }
    : { lead: placeholder.slice(0, at), example: placeholder.slice(at + 3) };
};

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
  const [dismissedProblem, setDismissedProblem] = useState<QueryProblem | null>(null);
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

  const { lead, example } = splitPlaceholder(placeholder);
  const listOpen = open && (items.length > 0 || suggestions.isPending);
  const showProblem = problem !== null && problem !== dismissedProblem && !listOpen;

  return (
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
            <span className="flex min-w-0 items-center truncate text-text-muted">
              <span className={cn('font-sans text-sm leading-none', example && 'max-lg:hidden')}>{lead}</span>
              {example ? (
                <>
                  <span className="px-1.5 font-sans text-sm leading-none max-lg:hidden">·</span>
                  <span className="truncate">{example}</span>
                </>
              ) : null}
            </span>
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
          aria-describedby={showProblem ? 'query-problem' : undefined}
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

      {listOpen ? (
        <div
          id="query-suggestions"
          role="listbox"
          // Mouse down would blur the input and close the list before the click lands.
          onMouseDown={event => event.preventDefault()}
          className="absolute top-full left-[-1px] z-40 mt-1 max-h-[min(420px,60vh)] w-[min(560px,calc(100%+2px))] overflow-y-auto rounded-lg border bg-raised py-1 shadow-popover"
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
                    'flex h-[30px] items-center gap-6 px-3',
                    (index === active || (active === -1 && index === 0)) && 'bg-hover',
                  )}
                >
                  <span className={cn('min-w-0 truncate text-text', monoText)}>{item.label}</span>
                  {item.description && item.kind !== 'recent_search' && item.kind !== 'saved_search' ? (
                    <span className="ml-auto flex-none truncate text-2xs text-text-secondary">{item.description}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
          <div className="mt-1 flex items-center gap-3 border-t px-3 pt-1.5 pb-0.5 text-2xs text-text-muted">
            <span>
              <Kbd className="h-4 min-w-4 text-[10px]">⇥</Kbd> completes the highlighted item
            </span>
            <span>
              <Kbd className="h-4 min-w-4 text-[10px]">↵</Kbd> runs the search
            </span>
          </div>
        </div>
      ) : null}

      {/* Over the page, not in its flow: a typo must not shove the list, board or report down. */}
      {showProblem ? (
        <div
          id="query-problem"
          role="alert"
          className="absolute top-full left-[-1px] z-30 mt-1 flex w-max max-w-[min(720px,calc(100%+2px))] flex-col gap-2 rounded-lg border bg-raised py-2.5 pr-2 pl-3 shadow-popover"
        >
          <div className="flex items-start gap-2">
            <CircleAlert aria-hidden className="mt-0.5 size-icon-sm flex-none text-danger-fg" />
            <p className="min-w-0 flex-1 text-sm text-pretty text-text">{problem.message}</p>
            <button
              type="button"
              aria-label="Hide this message"
              onClick={() => setDismissedProblem(problem)}
              className="-my-0.5 grid size-6 flex-none place-items-center rounded-sm text-text-muted hover:bg-hover hover:text-text"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {problem.validValues.length > 0 && problem.span ? (
            <div className="flex flex-wrap items-center gap-1.5 pr-8 pl-6">
              <span className="text-xs text-text-secondary">Try</span>
              {problem.validValues.slice(0, 8).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => replaceSpan(/\s/.test(v) ? `{${v}}` : v)}
                  className={cn(
                    'h-6 rounded-xs border bg-surface px-2 text-text-secondary hover:border-border-strong hover:bg-hover hover:text-text',
                    monoText,
                  )}
                >
                  {v}
                </button>
              ))}
              {problem.validValues.length > 8 ? (
                <span className="text-xs text-text-muted">+{problem.validValues.length - 8} more</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
