'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarRange, X } from 'lucide-react';
import { BACKLOG_TARGET, type CreateSprint, type Sprint } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Checkbox } from '@components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';
import { ConfirmDialog } from '@components/confirm-dialog';
import { MonthGrid } from '@components/date-picker';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { sprintDatesLabel } from '@components/agile/sprint-dates';
import { useApiError } from '@hooks/use-api-error';
import { useCreateSprint, useDeleteSprint, useFinishSprint, useStartSprint, useUpdateSprint } from '@hooks/use-sprints';
import { formatCalendarDateShort, todayCalendarDate } from '@lib/datetime';
import { listHref } from '@lib/issue-list/links';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';
import { formatCount, plural } from '@lib/numbers';

const unresolvedOf = (s: Sprint) => s.progress.issues - s.progress.resolved_issues;
const sprintQuery = (s: Sprint) => `sprint: {${s.name}} #Unresolved`;

const NUMBERED = /^(.*?)(\d+)\s*$/;

/** The next name in the project's numbered series ("Sprint 09" → "Sprint 10"), or null when there is none. */
export function nextSprintName(sprints: readonly Pick<Sprint, 'name'>[]): string | null {
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const { name } of sprints) {
    const match = NUMBERED.exec(name);
    if (!match) continue;
    const n = Number(match[2]);
    if (!best || n > best.n) best = { prefix: match[1]!, n, width: match[2]!.length };
  }
  if (!best) return null;
  const taken = new Set(sprints.map(s => s.name.toLowerCase()));
  let n = best.n + 1;
  const name = (k: number) => `${best.prefix}${String(k).padStart(best.width, '0')}`;
  while (taken.has(name(n).toLowerCase())) n += 1;
  return name(n);
}

const scrollToSprint = (name: string) =>
  document
    .querySelector(`section[aria-label="${CSS.escape(name)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });

interface Range {
  from: string | null;
  to: string | null;
}

/** Two clicks on one month grid: the first day, then the last. Empty is Unscheduled. */
function ScheduleField({ value, onChange, locked }: { value: Range; onChange: (r: Range) => void; locked?: boolean }) {
  const [open, setOpen] = useState(false);
  const picking = value.from !== null && value.to === null;
  const label = sprintDatesLabel({ start_date: value.from, end_date: value.to });

  if (locked) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Schedule</span>
        <span className="text-sm tabular">{label}</span>
        <span className="text-xs text-text-secondary">A running sprint keeps its dates.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-secondary">Schedule</span>
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start self-start tabular" aria-label={`Schedule: ${label}`}>
              <CalendarRange className="text-text-muted" />
              <span className={cn(!value.from && !value.to && 'text-text-secondary')}>{label}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-[284px] p-3">
            <p className="mb-2 text-2xs text-text-secondary">
              {picking ? 'Now pick the last day.' : 'Pick the first day, then the last.'}
            </p>
            <MonthGrid
              value={null}
              range={value}
              onSelect={day => {
                if (!picking || day < value.from!) return onChange({ from: day, to: null });
                onChange({ from: value.from, to: day });
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {value.from || value.to ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Make it unscheduled"
            onClick={() => onChange({ from: null, to: null })}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function GoalField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="sprint-goal" className="text-sm font-medium text-text-secondary">
        Goal
      </label>
      <textarea
        id="sprint-goal"
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder="What this sprint is for, in a sentence or two. Markdown works."
        aria-invalid={Boolean(error)}
        className="field-sizing-content max-h-60 min-h-20 w-full resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted aria-invalid:border-danger-fg"
      />
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}

interface SprintFormDialogProps {
  projectKey: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this sprint; absent creates one. */
  sprint?: Sprint | null;
  /** Where "Add N unresolved issues from…" takes its issues from. */
  carryFrom?: Sprint | null;
  /** Prefilled on a new sprint: the next name in the series. */
  suggestedName?: string | null;
}

export function SprintFormDialog({ open, onOpenChange, ...rest }: SprintFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open ? <SprintForm {...rest} onClose={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function SprintForm({
  projectKey,
  projectName,
  sprint,
  carryFrom,
  suggestedName,
  onClose,
}: Omit<SprintFormDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const create = useCreateSprint(projectKey);
  const update = useUpdateSprint(projectKey);
  const pending = create.isPending || update.isPending;
  const error = useApiError(create.error ?? update.error, ['name', 'goal_md', 'start_date', 'end_date']);
  const [name, setName] = useState(sprint?.name ?? suggestedName ?? '');
  const [goal, setGoal] = useState(sprint?.goal_md ?? '');
  const [range, setRange] = useState<Range>({ from: sprint?.start_date ?? null, to: sprint?.end_date ?? null });
  const [carry, setCarry] = useState(false);
  const [submittedName, setSubmittedName] = useState<string | null>(null);
  const carryCount = carryFrom ? unresolvedOf(carryFrom) : 0;
  const nameError =
    error.code === 'sprint.name_taken' && error.fields['name']
      ? `${projectName} already has a sprint called “${submittedName ?? name.trim()}”.`
      : error.fields['name'];

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setSubmittedName(trimmed);
    const goal_md = goal.trim() === '' ? null : goal;
    if (sprint) {
      const dates = sprint.state === 'planned' ? { start_date: range.from, end_date: range.to } : {};
      update.mutate(
        { sprint: sprint.slug, body: { name: trimmed, goal_md, ...dates } },
        {
          onSuccess: s => {
            toast.success(`Saved ${s.name}.`);
            onClose();
          },
        },
      );
      return;
    }
    const body: CreateSprint = { name: trimmed, goal_md, start_date: range.from, end_date: range.to };
    if (carry && carryFrom) body.add_unresolved_from = carryFrom.slug;
    create.mutate(body, {
      onSuccess: s => {
        toast.success(
          carry && carryCount > 0 ? `Planned ${s.name} with ${plural(carryCount, 'issue')}.` : `Planned ${s.name}.`,
          { action: { label: 'Show sprint', onClick: () => scrollToSprint(s.name) } },
        );
        onClose();
      },
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{sprint ? `Edit ${sprint.name}` : 'New sprint'}</DialogTitle>
        <DialogDescription>
          {sprint
            ? 'Renaming changes the sprint’s link; old links stop working.'
            : 'Dates are optional while you plan; a sprint needs an end date to start.'}
        </DialogDescription>
      </DialogHeader>

      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        id="sprint-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Sprint name"
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          placeholder="Sprint 1"
          error={nameError}
          errorAction={
            error.code === 'sprint.name_taken' && suggestedName && suggestedName !== name.trim() ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="text-text"
                onClick={() => setName(suggestedName)}
              >
                Use “{suggestedName}”
              </Button>
            ) : undefined
          }
        />
        <GoalField value={goal} onChange={setGoal} error={error.fields['goal_md']} />
        <ScheduleField value={range} onChange={setRange} locked={sprint ? sprint.state !== 'planned' : false} />
        {error.fields['start_date'] || error.fields['end_date'] ? (
          <p className="-mt-2 text-xs text-danger-fg">{error.fields['start_date'] ?? error.fields['end_date']}</p>
        ) : null}
        {!sprint && carryFrom && carryCount > 0 ? (
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
            <label className="flex items-start gap-2">
              <Checkbox checked={carry} onCheckedChange={v => setCarry(v === true)} className="mt-0.5" />
              <span>
                Add {plural(carryCount, 'unresolved issue')} from “{carryFrom.name}”
              </span>
            </label>
            <Link
              href={listHref(sprintQuery(carryFrom), { project: projectKey })}
              target="_blank"
              className="text-brand-text hover:underline"
            >
              View them
            </Link>
          </div>
        ) : null}
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <PendingButton
          type="submit"
          form="sprint-form"
          disabled={name.trim() === ''}
          pending={pending}
          pendingLabel="Saving…"
        >
          {sprint ? 'Save changes' : 'Create sprint'}
        </PendingButton>
      </DialogFooter>
    </>
  );
}

interface SprintActionProps {
  projectKey: string;
  sprint: Sprint | null;
  onOpenChange: (open: boolean) => void;
}

export function StartSprintDialog({
  projectKey,
  sprint,
  onOpenChange,
  timeZone,
}: SprintActionProps & { timeZone?: string }) {
  return (
    <Dialog open={sprint !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {sprint ? (
          <StartForm projectKey={projectKey} sprint={sprint} timeZone={timeZone} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({
  projectKey,
  sprint,
  timeZone,
  onClose,
}: {
  projectKey: string;
  sprint: Sprint;
  timeZone?: string;
  onClose: () => void;
}) {
  const start = useStartSprint(projectKey);
  const error = useApiError(start.error, ['start_date', 'end_date']);
  const [range, setRange] = useState<Range>({ from: todayCalendarDate(timeZone), to: sprint.end_date });
  const { issues, points } = sprint.progress;
  const today = todayCalendarDate(timeZone);
  const startsWhen =
    sprint.start_date && sprint.start_date !== today
      ? `It starts today, ${formatCalendarDateShort(today)}, not the planned ${formatCalendarDateShort(sprint.start_date)}.`
      : 'It starts today.';

  const submit = () => {
    if (!range.from || !range.to) return;
    start.mutate(
      { sprint: sprint.slug, body: { start_date: range.from, end_date: range.to } },
      {
        onSuccess: s => {
          toast.success(`${s.name} started.`);
          onClose();
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Start {sprint.name}</DialogTitle>
        <DialogDescription>
          {plural(issues, 'issue')}
          {points > 0 ? `, ${plural(points, 'point')}` : ''}. {startsWhen}
        </DialogDescription>
      </DialogHeader>
      {error.summary ? <FormAlert title={error.summary} /> : null}
      <ScheduleField value={range} onChange={setRange} />
      {!range.to ? <p className="-mt-2 text-xs text-text-secondary">Pick the last day of the sprint.</p> : null}
      {error.fields['end_date'] || error.fields['start_date'] ? (
        <p className="-mt-2 text-xs text-danger-fg">{error.fields['end_date'] ?? error.fields['start_date']}</p>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={start.isPending}>
          Cancel
        </Button>
        <PendingButton
          onClick={submit}
          disabled={!range.from || !range.to}
          pending={start.isPending}
          pendingLabel="Starting…"
        >
          Start sprint
        </PendingButton>
      </DialogFooter>
    </>
  );
}

export function FinishSprintDialog({
  projectKey,
  sprint,
  planned,
  onOpenChange,
}: SprintActionProps & { planned: readonly Sprint[] }) {
  return (
    <Dialog open={sprint !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {sprint ? (
          <FinishForm projectKey={projectKey} sprint={sprint} planned={planned} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FinishForm({
  projectKey,
  sprint,
  planned,
  onClose,
}: {
  projectKey: string;
  sprint: Sprint;
  planned: readonly Sprint[];
  onClose: () => void;
}) {
  const finish = useFinishSprint(projectKey);
  const error = useApiError(finish.error, []);
  const [target, setTarget] = useState<string>(planned[0]?.slug ?? BACKLOG_TARGET);
  const unfinished = unresolvedOf(sprint);
  const { issues, resolved_issues, points, resolved_points } = sprint.progress;
  const pointsNote = points > 0 ? ` (${formatCount(resolved_points)} of ${formatCount(points)} points)` : '';
  // Someone else finished it first; the header behind the dialog has already caught up.
  const gone = error.code === 'sprint.not_active';

  const submit = () => {
    finish.mutate(
      { sprint: sprint.slug, body: { move_unfinished_to: target } },
      {
        onSuccess: result => {
          const where = result.moved_to ? result.moved_to.name : 'the backlog';
          toast.success(
            result.moved.length > 0
              ? `${sprint.name} finished. ${plural(result.moved.length, 'issue')} moved to ${where}.`
              : `${sprint.name} finished.`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Finish {sprint.name}</DialogTitle>
        <DialogDescription>
          {issues === 0
            ? 'It has no issues, so it closes empty.'
            : unfinished === 0
              ? `${issues === 1 ? 'Its issue is' : `All ${formatCount(issues)} issues are`} resolved${pointsNote} and stay in ${sprint.name}.`
              : `${plural(resolved_issues, 'resolved issue')}${pointsNote} ${resolved_issues === 1 ? 'stays' : 'stay'} in ${sprint.name}. Choose where the ${plural(unfinished, 'unfinished issue goes', 'unfinished issues go')}.`}
        </DialogDescription>
      </DialogHeader>
      {gone ? (
        <FormAlert title={`${sprint.name} is no longer running.`}>
          Someone finished it a moment ago. Close this to see the sprints as they are now.
        </FormAlert>
      ) : error.summary ? (
        <FormAlert title={error.summary} />
      ) : null}
      {unfinished > 0 ? (
        <RadioGroup
          value={target}
          onValueChange={setTarget}
          aria-label="Move unfinished issues to"
          className="flex flex-col gap-0 overflow-hidden rounded-md border"
        >
          {[{ value: BACKLOG_TARGET, label: 'The backlog', hint: 'Unplanned, at the bottom in their current order.' }]
            .concat(planned.map(s => ({ value: s.slug, label: s.name, hint: `Planned · ${sprintDatesLabel(s)}` })))
            .map(option => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-hover has-[[data-state=checked]]:bg-active"
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <span className="flex flex-col">
                  <span className="text-sm">{option.label}</span>
                  <span className="text-xs text-text-secondary">{option.hint}</span>
                </span>
              </label>
            ))}
        </RadioGroup>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={finish.isPending}>
          {gone ? 'Close' : 'Cancel'}
        </Button>
        <PendingButton onClick={submit} disabled={gone} pending={finish.isPending} pendingLabel="Finishing…">
          Finish sprint
        </PendingButton>
      </DialogFooter>
    </>
  );
}

export function DeleteSprintDialog({ projectKey, sprint, onOpenChange }: SprintActionProps) {
  const remove = useDeleteSprint(projectKey);
  const n = sprint?.progress.issues ?? 0;
  return (
    <ConfirmDialog
      open={sprint !== null}
      onOpenChange={onOpenChange}
      title={sprint ? `Delete “${sprint.name}”?` : 'Delete sprint?'}
      confirmLabel="Delete sprint"
      pendingLabel="Deleting…"
      pending={remove.isPending}
      onConfirm={() =>
        sprint &&
        remove.mutate(sprint.slug, {
          onSuccess: () => {
            toast.success(`${sprint.name} deleted.`);
            onOpenChange(false);
          },
          onError: e => toastError(`Could not delete ${sprint.name}`, e),
        })
      }
    >
      <p>
        {n === 0
          ? 'It has no issues. This cannot be undone.'
          : `Its ${plural(n, 'issue goes', 'issues go')} back to the backlog, each with a history entry. The sprint itself cannot be restored.`}
      </p>
    </ConfirmDialog>
  );
}
