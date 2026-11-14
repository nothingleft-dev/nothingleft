'use client';

import { useState } from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
import type { Tag } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { SettingsSection } from '@components/settings/section';
import { TagChip } from '@components/issues/issue-tags';
import { DeleteTagDialog, EditTagDialog, MergeTagsDialog } from '@components/organization/tags/tag-dialogs';
import { tagCount, tagUsage } from '@components/organization/tags/tag-usage';
import { useDebounced } from '@hooks/use-debounced';
import { MANAGED_TAGS_PAGE, useManagedTags } from '@hooks/use-tags';
import { cn } from '@lib/utils';

// The chip column holds the longest name a tag can have, so every count starts at one x.
const ROW =
  'grid min-h-row grid-cols-[minmax(0,24rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-3 py-1.5 max-sm:grid-cols-[minmax(0,1fr)_auto]';

type Open =
  { kind: 'edit'; tag: Tag } | { kind: 'merge'; tags: Tag[]; into: Tag | null } | { kind: 'delete'; tag: Tag };

export function TagsTab({ orgAdmin }: { orgAdmin: boolean }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const list = useManagedTags(q);
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);

  const tags = list.data?.tags ?? [];
  const total = list.data?.total ?? 0;
  const none = list.data !== undefined && total === 0 && !q && !text;

  return (
    <SettingsSection
      title="Tags"
      description="One vocabulary for every project, shared by issues and knowledge base articles. Counts cover the whole organisation."
    >
      <div className={cn('flex flex-wrap items-center gap-3', none && 'hidden')}>
        <label className="relative max-w-xs min-w-48 flex-1">
          <span className="sr-only">Search tags</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-icon-sm -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="Search tags"
            className="h-control w-full rounded-md border border-border-strong bg-surface pr-3 pl-8 text-sm text-text placeholder:text-text-muted"
          />
        </label>
        {list.data ? (
          <span className="text-xs text-text-secondary tabular" role="status">
            {total > tags.length ? `${tags.length} of ${tagCount(total)}` : tagCount(total)}
          </span>
        ) : null}
      </div>

      {list.isPending ? (
        <TagsSkeleton />
      ) : list.isError && !list.data ? (
        <LoadError onRetry={() => void list.refetch()} detail={errorDetail(list.error)}>
          The tags could not be loaded.
        </LoadError>
      ) : tags.length === 0 && q ? (
        <EmptyState
          title={`No tag matches “${q}”.`}
          description="Search looks at tag names. Clear it to see every tag."
          action={
            <Button variant="outline" size="xs" onClick={() => setText('')}>
              Clear the search
            </Button>
          }
        />
      ) : tags.length === 0 ? (
        <EmptyState
          title="No tags yet."
          description="Tags appear here once someone adds one to an issue or an article, with how many of each use it."
        />
      ) : (
        <ul
          className={cn('divide-y divide-border-subtle rounded-md border', list.isPlaceholderData && 'is-stale')}
          aria-label="Tags"
        >
          {tags.map(tag => (
            <TagRow
              key={tag.slug}
              tag={tag}
              orgAdmin={orgAdmin}
              onEdit={() => setOpen({ kind: 'edit', tag })}
              onMerge={() => setOpen({ kind: 'merge', tags: [tag], into: null })}
              onDelete={() => setOpen({ kind: 'delete', tag })}
            />
          ))}
        </ul>
      )}

      {total > MANAGED_TAGS_PAGE && !q ? (
        <p className="text-xs text-text-secondary">
          The first {MANAGED_TAGS_PAGE} are listed, in alphabetical order. Search to find the rest.
        </p>
      ) : null}

      {open?.kind === 'edit' ? (
        <EditTagDialog
          key={open.tag.slug}
          tag={open.tag}
          orgAdmin={orgAdmin}
          onClose={close}
          onMergeInstead={(tag, into) => setOpen({ kind: 'merge', tags: [tag], into })}
        />
      ) : null}
      {open?.kind === 'merge' ? (
        <MergeTagsDialog
          key={open.tags.map(t => t.slug).join()}
          initial={{ tags: open.tags, into: open.into }}
          onClose={close}
        />
      ) : null}
      <DeleteTagDialog tag={open?.kind === 'delete' ? open.tag : null} onClose={close} />
    </SettingsSection>
  );
}

interface TagRowProps {
  tag: Tag;
  orgAdmin: boolean;
  onEdit: () => void;
  onMerge: () => void;
  onDelete: () => void;
}

function TagRow({ tag, orgAdmin, onEdit, onMerge, onDelete }: TagRowProps) {
  const usage = tagUsage(tag);
  return (
    <li className={ROW}>
      <span className="min-w-0 overflow-hidden whitespace-nowrap" title={tag.name}>
        <TagChip tag={tag} />
      </span>
      <span className="min-w-0 truncate text-sm text-text-secondary tabular max-sm:col-start-1 max-sm:row-start-2 max-sm:text-xs">
        {usage ?? 'Unused'}
      </span>
      <span className="flex items-center gap-1 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1">
        <Button variant="ghost" size="xs" onClick={onEdit} aria-label={`Rename or recolour ${tag.name}`}>
          Edit
        </Button>
        {orgAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`More actions for ${tag.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onMerge}>Merge into…</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </span>
    </li>
  );
}

function TagsSkeleton() {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading tags">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={ROW}>
          <Skeleton className="h-5 rounded-sm" style={{ width: `${48 + ((i * 23) % 56)}px` }} />
          <Skeleton className="h-3 w-24 max-sm:col-start-1 max-sm:row-start-2" />
          <Skeleton className="h-3 w-16 max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1" />
        </div>
      ))}
    </div>
  );
}
