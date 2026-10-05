'use client';

import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { Check, ListChecks, Plus } from 'lucide-react';
import type {
  BoardCard as Card,
  BoardColumnField,
  BoardLane,
  CreateIssue,
  LabelColor,
  TagRef,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { MonthGrid } from '@components/date-picker';
import { IssueKey } from '@components/issue-key';
import { DueDate } from '@components/issues/due-date';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PickerSkeleton } from '@components/issues/pickers';
import { StoryPoints } from '@components/agile/story-points';
import { usePatchCard } from '@hooks/use-boards';
import { useCreateIssue } from '@hooks/use-issues';
import { useOrganization } from '@hooks/use-organizations';
import { useProjectAssignees } from '@hooks/use-projects';
import { useSession } from '@hooks/use-session';
import { formatCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';
import { personTitle } from '@components/former-member-chip';

export function SubtaskProgress({ resolved, total }: { resolved: number; total: number }) {
  if (total === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 font-mono text-2xs tabular text-text-secondary">
          <ListChecks aria-hidden className="size-3.5 text-text-muted" />
          {resolved}/{total}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {resolved} of {total} subtasks resolved
      </TooltipContent>
    </Tooltip>
  );
}

interface BoardCardProps {
  card: Card;
  projectKey: string;
  today: string;
  /** Contributor and up: the assignee and due-date controls open pickers. */
  canEdit?: boolean;
  dragging?: boolean;
  overlay?: boolean;
}

// Tags share one line: as many as fit this many characters, never more than three.
const TAG_BUDGET = 28;
const TAGS_MAX = 3;

function visibleTags(tags: readonly TagRef[]) {
  const shown: TagRef[] = [];
  let used = 0;
  for (const tag of tags) {
    if (shown.length === TAGS_MAX || (shown.length > 0 && used + tag.name.length > TAG_BUDGET)) break;
    shown.push(tag);
    used += tag.name.length;
  }
  return { shown, hidden: tags.slice(shown.length) };
}

// A control inside the card, or its popover (portals bubble through React), keeps its events from the card's drag and open.
const own = {
  onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
  onPointerDown: (e: PointerEvent) => e.stopPropagation(),
  onDoubleClick: (e: MouseEvent) => e.stopPropagation(),
};

export function BoardCard({
  card,
  projectKey,
  today,
  canEdit = false,
  dragging = false,
  overlay = false,
}: BoardCardProps) {
  const { shown, hidden } = visibleTags(card.tags);
  return (
    <article
      className={cn(
        `l-${card.priority.color} flex flex-col gap-2 rounded-md border border-l-[3px] border-l-c-solid bg-surface px-2.5 py-2 transition-colors select-none hover:border-border-strong hover:border-l-c-solid`,
        dragging && 'opacity-40',
        overlay && 'rotate-1 shadow-lg',
      )}
    >
      <p className="line-clamp-3 text-sm leading-5">
        <a href={`/issue/${card.key}`} target="_blank" rel="noopener" {...own} className="mr-1.5 hover:underline">
          <IssueKey issueKey={card.key} resolved={card.resolved} />
        </a>
        <span className={cn(card.resolved && 'text-text-muted line-through')}>{card.title}</span>
      </p>

      {shown.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1">
          {shown.map(tag => (
            <span
              key={tag.slug}
              className="inline-flex h-5 min-w-0 items-center truncate rounded-sm border px-1.5 text-2xs font-medium text-text-secondary"
            >
              <span className="truncate">{tag.name}</span>
            </span>
          ))}
          {hidden.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-2xs text-text-muted tabular">+{hidden.length}</span>
              </TooltipTrigger>
              <TooltipContent>{hidden.map(t => t.name).join(', ')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
        <CardAssignees card={card} projectKey={projectKey} canEdit={canEdit && !overlay} />
        <ValueName value={card.priority} label="Priority" dim={card.resolved} />
        <ValueName value={card.type} label="Type" dim={card.resolved} />
        <CardDueDate card={card} today={today} canEdit={canEdit && !overlay} />
        <span className="ml-auto flex items-center gap-2">
          <SubtaskProgress resolved={card.subtasks.resolved} total={card.subtasks.total} />
          <StoryPoints points={card.story_points} />
        </span>
      </div>
    </article>
  );
}

export function ValueName({
  value,
  label,
  dim,
}: {
  value: { name: string; color: LabelColor };
  label: string;
  dim: boolean;
}) {
  return (
    <span
      aria-label={`${label}: ${value.name}`}
      className={cn('inline-flex min-w-0 items-center gap-1.5 text-text-secondary', dim && 'opacity-55')}
    >
      <i aria-hidden className={`l-${value.color} inline-block size-2 flex-none rounded-full bg-c-solid`} />
      <span className="truncate">{value.name}</span>
    </span>
  );
}

function useMyUsername() {
  const session = useSession();
  const slug = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  return useOrganization(slug).data?.membership.username ?? null;
}

function CardAssignees({ card, projectKey, canEdit }: { card: Card; projectKey: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const people = useProjectAssignees(open ? projectKey : null);
  const me = useMyUsername();
  const patch = usePatchCard();

  const avatars =
    card.assignees.length === 0 ? (
      <span aria-hidden className="inline-block size-5 rounded-full border border-dashed border-border-strong" />
    ) : (
      <span className="flex items-center gap-0.5">
        {card.assignees.map(person => (
          <Tooltip key={person.username}>
            <TooltipTrigger asChild>
              <span>
                <MemberAvatar member={person} className="size-5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{personTitle(person)}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    );

  if (!canEdit) {
    return (
      <span aria-label={card.assignees.length ? card.assignees.map(a => a.name).join(', ') : 'Unassigned'}>
        {avatars}
      </span>
    );
  }

  const save = (usernames: string[]) => {
    const before = card.assignees
      .map(a => a.username)
      .sort()
      .join();
    if ([...usernames].sort().join() === before) return;
    const known = [...card.assignees, ...(people.data ?? [])];
    patch.mutate(
      {
        key: card.key,
        body: { assignees: usernames },
        apply: c => ({ ...c, assignees: usernames.map(u => known.find(p => p.username === u)!).filter(Boolean) }),
      },
      { onError: e => toast.error(e.message) },
    );
  };

  const list = [...(people.data ?? [])].sort((a, b) => (a.username === me ? -1 : b.username === me ? 1 : 0));

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setDraft(card.assignees.map(a => a.username));
        else save(draft);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          {...own}
          aria-label={`Assignees of ${card.key}: ${card.assignees.map(a => a.name).join(', ') || 'Unassigned'}`}
          className="rounded-full hover:ring-2 hover:ring-border-strong"
        >
          {avatars}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" {...own}>
        <Command>
          <CommandInput placeholder="Search user" />
          <CommandList>
            {people.isPending ? <PickerSkeleton /> : <CommandEmpty>Nobody in this project matches.</CommandEmpty>}
            {people.isPending ? null : (
              <CommandItem
                value="Unassigned"
                onSelect={() => {
                  setDraft([]);
                  save([]);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden
                  className="inline-block size-5 rounded-full border border-dashed border-border-strong"
                />
                <span className="flex-1">Unassigned</span>
                <Check className={cn('size-icon-sm', draft.length === 0 ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            )}
            {list.map(person => {
              const on = draft.includes(person.username);
              return (
                <CommandItem
                  key={person.username}
                  value={`${person.name} ${person.username}`}
                  onSelect={() => setDraft(d => (on ? d.filter(u => u !== person.username) : [...d, person.username]))}
                >
                  <MemberAvatar member={person} className="size-5" />
                  <span className="min-w-0 flex-1 truncate">{person.username === me ? 'Me' : person.name}</span>
                  <span className="truncate text-xs text-text-muted">@{person.username}</span>
                  <Check className={cn('size-icon-sm', on ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CardDueDate({ card, today, canEdit }: { card: Card; today: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(card.due_date);
  const patch = usePatchCard();
  const shown = card.due_date ? (
    <DueDate value={card.due_date} today={today} resolved={card.resolved} />
  ) : (
    <span className="text-xs text-text-muted">No due date</span>
  );
  if (!canEdit) return shown;

  const apply = (value: string | null) => {
    setOpen(false);
    if (value === card.due_date) return;
    patch.mutate(
      { key: card.key, body: { due_date: value }, apply: c => ({ ...c, due_date: value }) },
      { onError: e => toast.error(e.message) },
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setPending(card.due_date);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" {...own} aria-label={`Due date of ${card.key}`} className="rounded-xs hover:underline">
          {shown}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[284px] p-3" {...own}>
        <p className="mb-2 text-sm font-medium tabular">{pending ? formatCalendarDate(pending) : 'No due date'}</p>
        <MonthGrid value={pending} onSelect={setPending} />
        <div className="mt-3 flex gap-2 border-t pt-3">
          <Button size="sm" onClick={() => apply(pending)}>
            Apply changes
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {card.due_date ? (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => apply(null)}>
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface NewCardProps {
  projectKey: string;
  sprint: string;
  /** The column's field and first value, which the new issue takes. */
  field: BoardColumnField;
  value: string;
  lane: BoardLane;
  swimlaneField: string | null;
}

/** What a lane stands for is given to the new card, so it lands in the cell it was typed in. */
function laneFields(lane: BoardLane, field: string | null): Partial<CreateIssue> {
  if (lane.kind === 'issue' && lane.key) return { parent: lane.key };
  if (lane.kind !== 'value' || !lane.key) return {};
  if (field === 'assignee') return { assignees: [lane.key] };
  if (field === 'priority') return { priority: lane.key };
  if (field === 'type') return { type: lane.key };
  return {};
}

export function NewCard({ projectKey, sprint, field, value, lane, swimlaneField }: NewCardProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useCreateIssue();

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-text-secondary opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100"
        onClick={() => setOpen(true)}
      >
        <Plus />
        New card
      </Button>
    );
  }

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed === '') return;
    create.mutate(
      {
        body: { project: projectKey, title: trimmed, sprint, ...laneFields(lane, swimlaneField), [field]: value },
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: issue => {
          setTitle('');
          toast.success(`Created ${issue.key}.`);
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface p-2"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Title, then ↵"
        aria-label="New card title"
        className="w-full resize-none bg-transparent text-sm text-text placeholder:text-text-muted"
      />
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={create.isPending || title.trim() === ''}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
