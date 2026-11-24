'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { slugify } from '@nothingleft/format';
import { DEFAULT_LABEL_COLOR, type Issue, type LabelColor, type TagContext, type TagRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { LabelColorPicker } from '@components/label-color-picker';
import { Field } from '@components/auth/field';
import { PickerSkeleton } from '@components/issues/pickers';
import { useDebounced } from '@hooks/use-debounced';
import { useIssueTag } from '@hooks/use-issues';
import { useTags } from '@hooks/use-tags';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';

const NEW_TAG_COLOR: LabelColor = DEFAULT_LABEL_COLOR;

interface IssueTagsProps {
  issue: Issue;
  canEdit: boolean;
  /** Opened from the title row's tag button as well as from the trailing `+`. */
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}

export function IssueTags({ issue, canEdit, pickerOpen, onPickerOpenChange }: IssueTagsProps) {
  const tag = useIssueTag(issue.key);
  const [expanded, setExpanded] = useState(false);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(issue.tags.length);

  // One row: the chips that fit beside the count and the add button; the rest wait behind `+N`.
  useLayoutEffect(() => {
    const row = measure.current;
    if (!row) return;
    const count = () => {
      const chips = [...row.children] as HTMLElement[];
      const top = chips[0]?.offsetTop ?? 0;
      setFit(Math.max(1, chips.filter(chip => chip.offsetTop === top).length));
    };
    count();
    const observer = new ResizeObserver(count);
    observer.observe(row);
    return () => observer.disconnect();
  }, [issue.tags]);

  if (issue.tags.length === 0 && !canEdit) return null;

  // Applied by the name as typed, so a new tag keeps its capitals; removed by slug.
  const change = (t: TagRef, on: boolean, isNew = false) =>
    tag.mutate(
      { tag: on ? t.name : t.slug, on, color: isNew ? t.color : undefined },
      { onError: error => toastError(on ? `Could not add ${t.name}` : `Could not remove ${t.name}`, error) },
    );

  const hidden = issue.tags.length - fit;
  const shown = expanded || hidden <= 0 ? issue.tags : issue.tags.slice(0, fit);

  return (
    <div className="relative mt-2 flex flex-wrap items-center gap-1" aria-label="Tags">
      <div
        ref={measure}
        aria-hidden
        inert
        className="invisible absolute top-0 left-0 flex h-5 w-[calc(100%-6rem)] flex-wrap gap-1 overflow-hidden"
      >
        {issue.tags.map(t => (
          <TagChip key={t.slug} tag={t} />
        ))}
      </div>
      {shown.map(t => (
        <TagChip key={t.slug} tag={t} onRemove={canEdit ? () => change(t, false) : undefined} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? undefined : `Show ${hidden} more ${hidden === 1 ? 'tag' : 'tags'}`}
          onClick={() => setExpanded(!expanded)}
          className="inline-flex h-5 items-center rounded-sm border border-border-strong px-1.5 text-2xs font-medium tabular text-text-secondary hover:bg-hover hover:text-text"
        >
          {expanded ? 'Show fewer' : `+${hidden}`}
        </button>
      ) : null}
      {canEdit ? (
        <TagPicker
          applied={issue.tags}
          open={pickerOpen}
          onOpenChange={onPickerOpenChange}
          onChange={change}
          empty={issue.tags.length === 0}
        />
      ) : null}
    </div>
  );
}

export function TagChip({ tag, onRemove }: { tag: TagRef; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        `l-${tag.color}`,
        'tag-chip group/tag relative inline-flex h-5 max-w-40 min-w-0 items-center rounded-sm px-1.5 text-2xs font-medium',
        // Touch has no hover, so the × is always there and keeps its own room.
        onRemove && '[@media(hover:none)]:pr-5',
      )}
    >
      <span className="truncate" title={tag.name}>
        {tag.name}
      </span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${tag.name}`}
          onClick={onRemove}
          className="group/x absolute inset-y-0 right-0 grid w-5 place-items-center rounded-r-sm bg-(--tag-bg) reveal group-hover/tag:opacity-100 before:absolute before:inset-y-0 before:-left-1.5 before:w-1.5 before:bg-linear-to-r before:from-transparent before:to-(--tag-bg) [@media(hover:none)]:before:hidden"
        >
          <span className="grid size-3.5 place-items-center rounded-xs group-hover/x:bg-text/15">
            <X className="size-3" />
          </span>
        </button>
      ) : null}
    </span>
  );
}

interface TagPickerProps {
  applied: readonly TagRef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `isNew` is a tag nobody has used yet, with the colour chosen for it. */
  onChange: (tag: TagRef, on: boolean, isNew?: boolean) => void;
  empty: boolean;
  /** Ranks tags already used on this kind of thing first; every tag stays offered. */
  context?: TagContext;
}

export function TagPicker({ applied, open, onOpenChange, onChange, empty, context }: TagPickerProps) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const [color, setColor] = useState<LabelColor>(NEW_TAG_COLOR);
  const debounced = useDebounced(search.trim(), 200);
  const tags = useTags(debounced, open, context);

  const typedSlug = slugify(search.trim());
  const exists = (tags.data ?? []).some(t => t.slug === typedSlug) || applied.some(t => t.slug === typedSlug);
  const appliedSlugs = new Set(applied.map(t => t.slug));
  const loading = tags.isPending || debounced !== search.trim();

  const reset = (next: boolean) => {
    if (!next) {
      setSearch('');
      setCreating(null);
      setColor(NEW_TAG_COLOR);
    }
    onOpenChange(next);
  };

  return (
    <Popover open={open} onOpenChange={reset}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add tag"
          className={cn(
            'inline-flex h-5 items-center gap-1 rounded-sm border border-dashed border-border-strong px-1 text-2xs text-text-secondary hover:border-text-muted hover:bg-hover hover:text-text',
            empty && 'px-1.5',
          )}
        >
          <Plus className="size-3" />
          {empty ? 'Add tag' : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {creating !== null ? (
          <form
            noValidate
            className="flex flex-col gap-3 p-3"
            onSubmit={e => {
              e.preventDefault();
              // React bubbles submit through portals: the create-issue form around this must not see it.
              e.stopPropagation();
              const name = creating.trim();
              if (!name) return;
              onChange({ name, slug: slugify(name), color }, true, true);
              reset(false);
            }}
          >
            <Field label="Name" value={creating} autoFocus onChange={e => setCreating(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Colour</span>
              <LabelColorPicker value={color} onChange={setColor} />
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              Preview
              <TagChip tag={{ name: creating.trim() || 'Tag', slug: slugify(creating), color }} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!creating.trim()}>
                Create tag
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(null)}>
                Back
              </Button>
            </div>
          </form>
        ) : (
          <PickerCommand shouldFilter={false}>
            <CommandInput placeholder="Find or create a tag" value={search} onValueChange={setSearch} />
            <CommandList>
              {loading && (tags.data ?? []).length === 0 ? (
                <PickerSkeleton rows={3} />
              ) : (
                <CommandEmpty>{typedSlug ? 'No tag matches.' : 'This organisation has no tags yet.'}</CommandEmpty>
              )}
              {(tags.data ?? []).length > 0 ? (
                <CommandGroup>
                  {(tags.data ?? []).map(t => {
                    const on = appliedSlugs.has(t.slug);
                    return (
                      <PickerItem checked={on} key={t.slug} value={t.slug} onSelect={() => onChange(t, !on)}>
                        <i aria-hidden className={`l-${t.color} size-2 flex-none rounded-full bg-c-solid`} />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      </PickerItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {typedSlug && !exists && !loading ? (
                <CommandGroup>
                  <CommandItem value={`create:${typedSlug}`} onSelect={() => setCreating(search.trim())}>
                    <Plus className="size-icon-sm" />
                    <span className="min-w-0 flex-1 truncate">
                      Create <span className="font-medium">{search.trim()}</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </PickerCommand>
        )}
      </PopoverContent>
    </Popover>
  );
}
