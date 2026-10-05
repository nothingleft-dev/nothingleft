'use client';

import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { slugify } from '@nothingleft/format';
import { DEFAULT_LABEL_COLOR, type Issue, type LabelColor, type TagContext, type TagRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { LabelColorPicker } from '@components/label-color-picker';
import { PickerSkeleton } from '@components/issues/pickers';
import { useDebounced } from '@hooks/use-debounced';
import { useIssueTag } from '@hooks/use-issues';
import { useTags } from '@hooks/use-tags';
import { cn } from '@lib/utils';

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
  if (issue.tags.length === 0 && !canEdit) return null;

  // Applied by the name as typed, so a new tag keeps its capitals; removed by slug.
  const change = (t: TagRef, on: boolean, isNew = false) =>
    tag.mutate(
      { tag: on ? t.name : t.slug, on, color: isNew ? t.color : undefined },
      { onError: error => toast.error(error.message) },
    );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Tags">
      {issue.tags.map(t => (
        <TagChip key={t.slug} tag={t} onRemove={canEdit ? () => change(t, false) : undefined} />
      ))}
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
        'group/tag inline-flex h-5 items-center rounded-sm bg-c-bg pl-1.5 text-2xs font-medium text-c-fg',
        onRemove ? 'pr-0.5' : 'pr-1.5',
      )}
    >
      {tag.name}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${tag.name}`}
          onClick={onRemove}
          className="ml-0.5 inline-flex size-3.5 items-center justify-center rounded-xs opacity-0 group-hover/tag:opacity-70 hover:bg-c-fg/15 hover:opacity-100! focus-visible:opacity-100"
        >
          <X className="size-3" />
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
        {creating ? (
          <form
            noValidate
            className="flex flex-col gap-3 p-3"
            onSubmit={e => {
              e.preventDefault();
              // React bubbles submit through portals: the create-issue form around this must not see it.
              e.stopPropagation();
              onChange({ name: creating, slug: slugify(creating), color }, true, true);
              reset(false);
            }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">New tag</span>
              <TagChip tag={{ name: creating, slug: slugify(creating), color }} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-secondary">Colour</span>
              <LabelColorPicker value={color} onChange={setColor} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Create tag
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(null)}>
                Back
              </Button>
            </div>
          </form>
        ) : (
          <Command shouldFilter={false}>
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
                      <CommandItem key={t.slug} value={t.slug} onSelect={() => onChange(t, !on)}>
                        <i aria-hidden className={`l-${t.color} size-2 flex-none rounded-full bg-c-solid`} />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <Check className={cn('size-icon-sm', on ? 'opacity-100' : 'opacity-0')} />
                      </CommandItem>
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
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
