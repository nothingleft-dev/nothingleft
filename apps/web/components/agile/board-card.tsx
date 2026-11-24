'use client';

import { usePriorityRise } from '@hooks/use-project-schema';
import { useId, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, ListChecks, Plus } from 'lucide-react';
import type {
  BoardCard as Card,
  BoardColumnField,
  BoardLane,
  CreateIssue,
  LabelColor,
  TagRef,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { MonthGrid } from '@components/date-picker';
import { IssueKey } from '@components/issue-key';
import { DueDate } from '@components/issues/due-date';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PickerSkeleton } from '@components/issues/pickers';
import { ValueDot } from '@components/issues/value-marks';
import { StoryPoints } from '@components/agile/story-points';
import { usePatchCard } from '@hooks/use-boards';
import { useCreateIssue } from '@hooks/use-issues';
import { useOrganization } from '@hooks/use-organizations';
import { useProjectAssignees } from '@hooks/use-projects';
import { useSession } from '@hooks/use-session';
import { formatCalendarDate } from '@lib/datetime';
import { DevelopmentIcon } from '@components/git/git-marks';
import { cn } from '@lib/utils';
import { personTitle } from '@components/former-member-chip';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

export function SubtaskProgress({ resolved, total }: { resolved: number; total: number }) {
  if (total === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex flex-none items-center gap-1 font-mono text-2xs tabular text-text-secondary">
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
  /** The card's column holds several statuses, so the card names its own. */
  showStatus?: boolean;
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

/** A card's priority and type: a dot and the name, the priority's dot grey at or below the project's default. */
export function CardValues({
  projectKey,
  priority,
  type,
  dim,
}: {
  projectKey: string;
  priority: Card['priority'];
  type: Card['type'];
  dim: boolean;
}) {
  const { raised } = usePriorityRise(projectKey, priority.name);
  return (
    <>
      <ValueName value={priority} label="Priority" dim={dim} plain={!raised} />
      <ValueName value={type} label="Type" dim={dim} />
    </>
  );
}

export function BoardCard({
  card,
  projectKey,
  today,
  canEdit = false,
  showStatus = false,
  dragging = false,
  overlay = false,
}: BoardCardProps) {
  const { shown, hidden } = visibleTags(card.tags);
  const { urgent } = usePriorityRise(projectKey, card.priority.name);
  const editable = canEdit && !overlay;
  const developing = card.development !== null && card.development !== 'none';
  // Points alone do not earn a line of their own: they end the values row instead.
  const footed = card.due_date !== null || developing || card.subtasks.total > 0;
  const points = <StoryPoints points={card.story_points} unit className="flex-none" />;
  return (
    <article
      className={cn(
        `l-${card.priority.color} group/card flex flex-col gap-2 rounded-md border bg-surface px-2.5 py-2 transition-colors select-none hover:border-border-strong`,
        // Drawn inside the 1 px border, so an edged card's text starts where every other card's does.
        urgent && !card.resolved && 'border-l-c-solid shadow-[inset_2px_0_0_var(--c-solid)] hover:border-l-c-solid',
        dragging && 'opacity-40',
        overlay && 'rotate-1 shadow-lg',
      )}
    >
      <p className="line-clamp-3 text-sm leading-5" title={card.title}>
        <a href={`/issue/${card.key}`} target="_blank" rel="noopener" {...own} className="mr-1.5 hover:underline">
          <IssueKey issueKey={card.key} resolved={card.resolved} />
        </a>
        <span className={cn('font-medium', card.resolved && 'text-text-secondary')}>{card.title}</span>
      </p>

      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
        <CardAssignees card={card} projectKey={projectKey} canEdit={editable} />
        {showStatus ? (
          <span aria-label={`Status: ${card.status.name}`} className="min-w-0 truncate font-medium text-text-secondary">
            {card.status.name}
          </span>
        ) : null}
        <CardValues projectKey={projectKey} priority={card.priority} type={card.type} dim={card.resolved} />
        <span className="ml-auto flex flex-none items-center gap-2">
          {card.due_date === null && editable ? <CardDueDate card={card} today={today} canEdit /> : null}
          {footed ? null : points}
        </span>
      </div>
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

      {footed ? (
        <div className="flex h-5 items-center gap-2 text-xs">
          {card.due_date !== null ? <CardDueDate card={card} today={today} canEdit={editable} /> : null}
          <span className="ml-auto flex min-w-0 items-center gap-2">
            {card.development ? <DevelopmentIcon rollup={card.development} labelled /> : null}
            <SubtaskProgress resolved={card.subtasks.resolved} total={card.subtasks.total} />
            {points}
          </span>
        </div>
      ) : null}
    </article>
  );
}

function ValueName({
  value,
  label,
  dim,
  plain = false,
}: {
  value: { name: string; color: LabelColor };
  label: string;
  dim: boolean;
  /** Nothing to flag: the dot stays grey whatever the value's colour. */
  plain?: boolean;
}) {
  return (
    <span
      aria-label={`${label}: ${value.name}`}
      className="inline-flex min-w-0 items-center gap-1.5 text-text-secondary"
    >
      <ValueDot color={value.color} plain={plain} className={cn(dim && 'opacity-55')} />
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
  const [chosenAtOpen, setChosenAtOpen] = useState<string[]>([]);
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
      { onError: e => toastError(`Could not change the assignees of ${card.key}`, e) },
    );
  };

  // The people already on the card first, then me; fixed at open so rows do not jump while ticking.
  const rank = (username: string) => (chosenAtOpen.includes(username) ? 0 : 2) + (username === me ? 0 : 1);
  const list = [...(people.data ?? [])].sort((a, b) => rank(a.username) - rank(b.username));

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) {
          setDraft(card.assignees.map(a => a.username));
          setChosenAtOpen(card.assignees.map(a => a.username));
        } else save(draft);
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
      <PopoverContent align="start" className="w-[22rem] p-0" {...own}>
        <PickerCommand>
          <CommandInput placeholder="Find a person" />
          <CommandList>
            {people.isPending ? <PickerSkeleton /> : <CommandEmpty>Nobody in this project matches.</CommandEmpty>}
            {people.isPending ? null : (
              <PickerItem
                checked={draft.length === 0}
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
              </PickerItem>
            )}
            {list.map(person => {
              const on = draft.includes(person.username);
              return (
                <PickerItem
                  checked={on}
                  key={person.username}
                  value={`${person.name} ${person.username}`}
                  onSelect={() => setDraft(d => (on ? d.filter(u => u !== person.username) : [...d, person.username]))}
                >
                  <MemberAvatar member={person} className="size-5" />
                  <span className="min-w-0 flex-1 truncate">{person.username === me ? 'Me' : person.name}</span>
                  <span className="truncate text-xs text-text-secondary">@{person.username}</span>
                </PickerItem>
              );
            })}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

function CardDueDate({ card, today, canEdit }: { card: Card; today: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(card.due_date);
  const patch = usePatchCard();
  // An undated card has no date line: the control waits at the end of the values row for the pointer.
  const shown = card.due_date ? (
    <DueDate value={card.due_date} today={today} resolved={card.resolved} worded />
  ) : (
    <CalendarPlus aria-hidden className="size-3.5" />
  );
  if (!canEdit) return card.due_date ? shown : null;

  const apply = (value: string | null) => {
    setOpen(false);
    if (value === card.due_date) return;
    patch.mutate(
      { key: card.key, body: { due_date: value }, apply: c => ({ ...c, due_date: value }) },
      { onError: e => toastError(`Could not change the due date of ${card.key}`, e) },
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
        <button
          type="button"
          {...own}
          aria-label={`Due date of ${card.key}`}
          title={card.due_date ? undefined : 'Set due date'}
          className={
            card.due_date
              ? 'rounded-xs hover:underline'
              : 'grid size-5 flex-none place-items-center rounded-xs text-text-muted reveal group-hover/card:opacity-100 hover:bg-hover hover:text-text'
          }
        >
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
  /** null: the backlog. */
  sprint: string | null;
  /** The column's field and first value, which the new issue takes. */
  field: BoardColumnField;
  value: string;
  lane: BoardLane;
  swimlaneField: string | null;
  /** On a board with lanes the control waits in the lane's band, so a row is only as tall as its cards. */
  inBand: boolean;
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

export function NewCard({ projectKey, sprint, field, value, lane, swimlaneField, inBand }: NewCardProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useCreateIssue();
  const hintId = useId();

  if (!open && inBand) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="New card"
            // The strip under it joins the control to its cell, so the pointer can cross without losing the hover.
            className="absolute right-2 bottom-full z-[6] mb-1.5 bg-app text-text-secondary reveal group-hover/cell:opacity-100 after:absolute after:inset-x-0 after:top-full after:h-1.5"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New card</TooltipContent>
      </Tooltip>
    );
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-mt-1 h-7 w-full justify-start text-text-secondary reveal group-hover/cell:opacity-100"
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
        onError: error => toastError('Could not create the issue', error),
      },
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface p-2 focus-within:shadow-(--focus-ring)"
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
        placeholder="Issue title"
        aria-label="New card title"
        aria-describedby={hintId}
        className="w-full resize-none bg-transparent px-1 py-0.5 text-sm leading-5 text-text placeholder:text-text-muted focus-visible:shadow-none"
      />
      <p id={hintId} className="-mt-1 px-1 text-2xs text-text-muted">
        Enter to create · Esc to cancel
      </p>
      <div className="flex gap-1">
        <PendingButton
          type="submit"
          size="sm"
          disabled={title.trim() === ''}
          pending={create.isPending}
          pendingLabel="Creating…"
        >
          Create
        </PendingButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
