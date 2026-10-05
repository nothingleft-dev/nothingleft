'use client';

import { useId, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { calendarDaysBetween, formatDuration, parseDuration, workingDaysBetween } from '@nothingleft/format';
import {
  WORK_ITEM_MAX_RECORDS,
  WORK_ITEM_NOTE_MAX_BYTES,
  WORK_ITEM_RANGE_MAX_DAYS,
  type CreateWorkItems,
  type MemberRef,
  type UpdateWorkItem,
  type WorkItem,
  type WorkItemRecord,
} from '@nothingleft/types';
import { markdownByteLength } from '@nothingleft/markdown';
import { Button } from '@components/ui/button';
import { Duration } from '@components/duration';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import { MonthGrid } from '@components/date-picker';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { Kbd } from '@components/kbd';
import { LetterBadge } from '@components/letter-badge';
import { Segmented } from '@components/segmented';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PickerSkeleton, ValueCommand } from '@components/issues/pickers';
import { useSchemaValues } from '@hooks/use-project-schema';
import { useWorkItemAttributes } from '@hooks/use-work-item-attributes';
import { useWorkCalendar, useWorkWeek } from '@hooks/use-work-calendar';
import { useUploader } from '@hooks/use-attachments';
import { useLogTime, useUpdateWorkItem, useWorkAuthors } from '@hooks/use-work-items';
import { isApiError } from '@lib/api/errors';
import { formatCalendarDate, formatCalendarRange, todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

type Mode = 'single' | 'range';

interface Problem {
  field: 'date' | 'duration';
  message: string;
}

interface Row {
  id: string;
  date: string | null;
  from: string | null;
  to: string | null;
  duration: string;
}

const MODES = [
  { value: 'single', label: 'Single dates' },
  { value: 'range', label: 'Date ranges' },
] as const satisfies readonly { value: Mode; label: string }[];

const NO_TYPE = 'No type';
const SUBMIT_KBD = 'h-4 border-transparent bg-ink-fg/15 text-ink-fg/80';
const inputClass =
  'h-control w-full rounded-md border border-border-strong bg-surface px-2.5 font-mono text-xs text-text tabular placeholder:text-text-muted aria-invalid:border-danger-fg';

export interface SpentTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: { key: string; title: string };
  projectKey: string;
  /** The viewer is a Project Admin here, so the author is theirs to choose. */
  canLogForOthers: boolean;
  me: MemberRef;
  timeZone?: string;
  /** Present when editing one record: one row, no ranges, PATCH instead of POST. */
  item?: WorkItem;
}

export function SpentTimeDialog({ open, onOpenChange, ...rest }: SpentTimeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-2xl">
        {open ? <SpentTimeForm {...rest} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

let rowSeed = 0;
const newRow = (date: string | null, duration = ''): Row => ({
  id: `r${++rowSeed}`,
  date,
  from: date,
  to: date,
  duration,
});

function SpentTimeForm({
  issue,
  projectKey,
  canLogForOthers,
  me,
  timeZone,
  item,
  onDone,
}: Omit<SpentTimeDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const calendar = useWorkCalendar();
  const week = useWorkWeek();
  const today = todayCalendarDate(timeZone);
  const workTypes = useSchemaValues(projectKey, 'work-types');
  const attributeList = useWorkItemAttributes(projectKey);
  const authors = useWorkAuthors(canLogForOthers ? projectKey : null);
  const log = useLogTime(issue.key);
  const update = useUpdateWorkItem(item?.issue ?? issue.key);
  // A new record's files are drafts until it is saved; an existing record's attach to it at once.
  const uploader = useUploader(item ? { issue: item.issue, work_item_id: item.id } : { project: projectKey });
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const [mode, setMode] = useState<Mode>('single');
  const [rows, setRows] = useState<Row[]>(() => [
    item ? newRow(item.work_date, formatDuration(item.duration_minutes, calendar)) : newRow(today),
  ]);
  const [author, setAuthor] = useState<MemberRef>(item?.author ?? me);
  const [workType, setWorkType] = useState<string | null | undefined>(
    item ? (item.work_type?.name ?? null) : undefined,
  );
  const [note, setNote] = useState(item?.description_md ?? '');
  const savedAttributes = Object.fromEntries((item?.attributes ?? []).map(a => [a.attribute, a.value.name]));
  const [attributes, setAttributes] = useState<Record<string, string | null>>(savedAttributes);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ field: string | null; message: string } | null>(null);

  const liveTypes = (workTypes.data ?? []).filter(t => !t.is_archived || t.name === item?.work_type?.name);
  // Until the list arrives the default is unknown; the API applies it when the field is left out.
  const chosenType = workType === undefined ? (liveTypes.find(t => t.is_default)?.name ?? null) : workType;
  const typeRow = liveTypes.find(t => t.name === chosenType);
  // An archived attribute or value stays offered only on the record that already has it.
  const liveAttributes = (attributeList.data ?? [])
    .filter(a => !a.is_archived || a.name in savedAttributes)
    .toSorted((a, b) => a.position - b.position)
    .map(a => ({
      ...a,
      values: a.values
        .filter(v => !v.is_archived || savedAttributes[a.name] === v.name)
        .toSorted((x, y) => x.position - y.position),
    }));

  const pending = log.isPending || update.isPending || uploader.busy;
  const noteTooLarge = markdownByteLength(note) > WORK_ITEM_NOTE_MAX_BYTES;

  const rowProblems = (row: Row): Problem[] => {
    const found: Problem[] = [];
    if (mode === 'single' && !row.date) found.push({ field: 'date', message: 'Choose a date.' });
    if (mode === 'range') {
      if (!row.from || !row.to) found.push({ field: 'date', message: 'Choose the first and the last day.' });
      else if (calendarDaysBetween(row.from, row.to) > WORK_ITEM_RANGE_MAX_DAYS) {
        found.push({ field: 'date', message: `A range can cover up to ${WORK_ITEM_RANGE_MAX_DAYS} days.` });
      } else if (workingDaysBetween(row.from, row.to, week).length === 0) {
        found.push({ field: 'date', message: 'There are no working days in this range.' });
      }
    }
    const minutes = parseDuration(row.duration.trim(), calendar);
    if (row.duration.trim() === '') found.push({ field: 'duration', message: 'Enter the time spent.' });
    else if (minutes === null || minutes <= 0) {
      found.push({ field: 'duration', message: 'Write the time as 1w 1d 1h 1m, or any part of that.' });
    }
    return found;
  };

  const serverRowError = (index: number): Problem | null => {
    if (!serverError?.field) return null;
    if (item && index === 0 && (serverError.field === 'duration' || serverError.field === 'work_date')) {
      return { field: serverError.field === 'duration' ? 'duration' : 'date', message: serverError.message };
    }
    const match = /^records\.(\d+)\.(\w+)$/.exec(serverError.field);
    if (!match || Number(match[1]) !== index) return null;
    return { field: match[2] === 'duration' ? 'duration' : 'date', message: serverError.message };
  };

  const problems = rows.map(rowProblems);
  const valid = problems.every(p => p.length === 0) && !noteTooLarge;
  const fieldError = (field: string) => (serverError?.field === field ? serverError.message : null);
  const formError =
    serverError &&
    !/^records\./.test(serverError.field ?? '') &&
    !['author', 'work_type', 'description_md', 'duration', 'work_date'].includes(serverError.field ?? '') &&
    !(serverError.field ?? '').startsWith('attributes.')
      ? serverError.message
      : null;

  const edit = (id: string, patch: Partial<Row>) => {
    setServerError(null);
    setRows(current => current.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const fail = (error: unknown) => {
    setServerError(
      isApiError(error)
        ? { field: error.field ?? null, message: error.message }
        : { field: null, message: 'The time could not be saved. Check your connection and try again.' },
    );
  };

  const submit = () => {
    setTouched(true);
    if (!valid || pending) return;
    setServerError(null);
    if (item) {
      const body: UpdateWorkItem = {};
      const row = rows[0]!;
      if (row.date && row.date !== item.work_date) body.work_date = row.date;
      if (parseDuration(row.duration.trim(), calendar) !== item.duration_minutes) body.duration = row.duration.trim();
      if (chosenType !== (item.work_type?.name ?? null)) body.work_type = chosenType;
      if (note !== item.description_md) body.description_md = note;
      if (author.username !== item.author.username) body.author = author.username;
      const changed = Object.entries(attributes).filter(([name, value]) => (savedAttributes[name] ?? null) !== value);
      if (changed.length > 0) body.attributes = Object.fromEntries(changed);
      const saved = () => {
        uploader.finish(note);
        onDone();
      };
      if (Object.keys(body).length === 0) return saved();
      update.mutate({ id: item.id, body }, { onSuccess: saved, onError: fail });
      return;
    }
    const records: WorkItemRecord[] = rows.map(r =>
      mode === 'single'
        ? { work_date: r.date!, duration: r.duration.trim() }
        : { from: r.from!, to: r.to!, duration: r.duration.trim() },
    );
    const body: CreateWorkItems = { records };
    if (author.username !== me.username) body.author = author.username;
    if (workType !== undefined) body.work_type = workType;
    if (note.trim() !== '') body.description_md = note;
    const chosen = Object.entries(attributes).filter(([, value]) => value !== null);
    if (chosen.length > 0) body.attributes = Object.fromEntries(chosen);
    const claimed = uploader.claimable(note);
    if (claimed.length > 0) body.attachment_ids = claimed;
    // The same body retried keeps its key, so a dropped response cannot log the time twice.
    const serialised = JSON.stringify(body);
    if (attempt.current?.body !== serialised) attempt.current = { body: serialised, key: crypto.randomUUID() };
    log.mutate(
      { body, idempotencyKey: attempt.current.key },
      {
        onSuccess: () => {
          uploader.finish(note);
          onDone();
        },
        onError: fail,
      },
    );
  };

  const totalMinutes = rows.reduce((sum, r) => {
    const minutes = parseDuration(r.duration.trim(), calendar) ?? 0;
    if (mode === 'single') return sum + minutes;
    const days = r.from && r.to ? workingDaysBetween(r.from, r.to, week).length : 0;
    return sum + minutes * days;
  }, 0);
  const recordCount = rows.reduce(
    (n, r) => n + (mode === 'single' ? 1 : r.from && r.to ? workingDaysBetween(r.from, r.to, week).length : 0),
    0,
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{item ? 'Edit spent time' : 'Add spent time'}</DialogTitle>
        <DialogDescription className="text-xs text-text-secondary">
          <span className="font-mono text-text">{item?.issue ?? issue.key}</span> {issue.title}
        </DialogDescription>
      </DialogHeader>

      {formError ? <FormAlert title={formError} /> : null}

      <AuthorField
        author={author}
        editable={canLogForOthers}
        people={authors.data ?? []}
        loading={authors.isPending}
        error={fieldError('author')}
        onChange={next => {
          setServerError(null);
          setAuthor(next);
        }}
      />

      {item ? null : (
        <Segmented
          ariaLabel="How to enter dates"
          value={mode}
          options={MODES}
          onChange={next => {
            setServerError(null);
            setMode(next);
          }}
        />
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const server = serverRowError(index);
          const shown = [...(touched ? problems[index]! : []), ...(server ? [server] : [])];
          return (
            <RecordRow
              key={row.id}
              row={row}
              mode={mode}
              index={index}
              removable={rows.length > 1}
              problems={shown}
              onChange={patch => edit(row.id, patch)}
              onRemove={() => setRows(current => current.filter(r => r.id !== row.id))}
              week={week}
            />
          );
        })}
        {item ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 self-start text-brand-text hover:text-brand-text"
              disabled={rows.length >= WORK_ITEM_MAX_RECORDS}
              onClick={() => setRows(current => [...current, newRow(mode === 'single' ? today : null)])}
            >
              <Plus /> Add another record
            </Button>
            {totalMinutes > 0 && (rows.length > 1 || mode === 'range') ? (
              <span className="text-xs text-text-secondary">
                {recordCount} {recordCount === 1 ? 'record' : 'records'} ·{' '}
                <Duration minutes={totalMinutes} calendar={calendar} className="text-text" /> in total
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className={cn('grid gap-4', liveAttributes.length > 0 && 'sm:grid-cols-2')}>
        <WorkTypeField
          value={chosenType}
          letter={typeRow?.short_label ?? null}
          options={liveTypes}
          loading={workTypes.isPending}
          error={fieldError('work_type')}
          onChange={next => {
            setServerError(null);
            setWorkType(next);
          }}
        />
        {liveAttributes.map(attribute => {
          const value = attributes[attribute.name] ?? null;
          return (
            <WorkTypeField
              key={attribute.name}
              label={attribute.name}
              emptyLabel={`No ${attribute.name}`}
              value={value}
              letter={attribute.values.find(v => v.name === value)?.short_label ?? null}
              options={attribute.values}
              loading={false}
              error={fieldError(`attributes.${attribute.name}`)}
              onChange={next => {
                setServerError(null);
                setAttributes(current => ({ ...current, [attribute.name]: next }));
              }}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <MarkdownEditor
          value={note}
          onChange={next => {
            if (serverError?.field === 'description_md') setServerError(null);
            setNote(next);
          }}
          projectKey={projectKey}
          label="Note"
          placeholder="Describe what you did during this time"
          invalid={noteTooLarge || Boolean(fieldError('description_md'))}
          onSubmit={submit}
          uploader={uploader}
        />
        {noteTooLarge || fieldError('description_md') ? (
          <p role="alert" className="text-xs text-danger-fg">
            {fieldError('description_md') ?? `A note can be up to ${WORK_ITEM_NOTE_MAX_BYTES / 1024} KB.`}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {uploader.busy ? 'Uploading…' : pending ? 'Saving…' : 'Save'} <Kbd className={SUBMIT_KBD}>⌘↵</Kbd>
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface RecordRowProps {
  row: Row;
  mode: Mode;
  index: number;
  removable: boolean;
  problems: Problem[];
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  week: ReturnType<typeof useWorkWeek>;
}

function RecordRow({ row, mode, index, removable, problems, onChange, onRemove, week }: RecordRowProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const label = index === 0 ? (mode === 'single' ? 'Date' : 'Dates') : null;
  const columns = removable ? 'grid-cols-[minmax(0,1fr)_132px_28px]' : 'grid-cols-[minmax(0,1fr)_132px]';
  const days = mode === 'range' && row.from && row.to ? workingDaysBetween(row.from, row.to, week).length : null;
  const noteId = problems.length > 0 ? `${id}-problem` : undefined;
  const dateProblem = problems.some(p => p.field === 'date');
  const durationProblem = problems.some(p => p.field === 'duration');

  const pickRange = (day: string) => {
    // First click starts a range; the second closes it, in whichever order the days were picked.
    if (!row.from || row.to) {
      onChange({ from: day, to: null });
      return;
    }
    const [from, to] = day < row.from ? [day, row.from] : [row.from, day];
    onChange({ from, to });
    setOpen(false);
  };

  const dateText =
    mode === 'single'
      ? row.date
        ? formatCalendarDate(row.date)
        : 'Choose a date'
      : row.from && row.to
        ? formatCalendarRange(row.from, row.to)
        : row.from
          ? `${formatCalendarDate(row.from)} – choose the last day`
          : 'Choose the first and last day';

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <div className={cn('grid gap-2 text-sm font-medium text-text-secondary', columns)}>
          <span>{label}</span>
          <label htmlFor={`${id}-duration`}>{mode === 'single' ? 'Spent time' : 'Per day'}</label>
        </div>
      ) : null}
      <div className={cn('grid items-center gap-2', columns)}>
        <Popover
          open={open}
          onOpenChange={next => {
            setOpen(next);
            // Closing mid-range keeps the one day picked as a one-day range.
            if (!next && mode === 'range' && row.from && !row.to) onChange({ to: row.from });
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label={mode === 'single' ? 'Date' : 'Date range'}
              aria-invalid={dateProblem || undefined}
              aria-describedby={dateProblem ? noteId : undefined}
              className={cn(
                'justify-start font-normal',
                dateProblem && 'border-danger-fg',
                !(mode === 'single' ? row.date : row.from) && 'text-text-muted',
              )}
            >
              <CalendarDays className="text-text-muted" />
              <span className="truncate">{dateText}</span>
              {days !== null ? (
                <span className="ml-auto shrink-0 text-xs text-text-muted">
                  {days} working {days === 1 ? 'day' : 'days'}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-3" align="start">
            {mode === 'single' ? (
              <MonthGrid
                value={row.date}
                onSelect={day => {
                  onChange({ date: day, from: day, to: day });
                  setOpen(false);
                }}
              />
            ) : (
              <>
                <MonthGrid value={null} range={{ from: row.from, to: row.to }} onSelect={pickRange} />
                <p className="mt-2 text-2xs text-text-secondary">
                  {row.from && !row.to ? 'Now pick the last day.' : 'Pick the first day, then the last.'}
                </p>
              </>
            )}
          </PopoverContent>
        </Popover>
        <input
          id={`${id}-duration`}
          value={row.duration}
          onChange={e => onChange({ duration: e.target.value })}
          placeholder="1w 1d 1h 1m"
          autoFocus={index === 0 && row.duration === ''}
          aria-label={index === 0 ? undefined : `Spent time, record ${index + 1}`}
          aria-invalid={durationProblem || undefined}
          aria-describedby={durationProblem ? noteId : undefined}
          autoComplete="off"
          className={inputClass}
        />
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove record ${index + 1}`}
            onClick={onRemove}
          >
            <X />
          </Button>
        ) : null}
      </div>
      {problems.length > 0 ? (
        <p id={noteId} role="alert" className="text-xs text-danger-fg">
          {problems.map(p => p.message).join(' ')}
        </p>
      ) : null}
    </div>
  );
}

interface AuthorFieldProps {
  author: MemberRef;
  editable: boolean;
  people: readonly MemberRef[];
  loading: boolean;
  error: string | null;
  onChange: (author: MemberRef) => void;
}

function AuthorField({ author, editable, people, loading, error, onChange }: AuthorFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const face = (
    <>
      <MemberAvatar member={author} className="size-5" />
      <PersonName person={author} className="truncate" />
    </>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-text-secondary">
        Author
      </span>
      {editable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-labelledby={`${id}-label`}
              aria-invalid={error ? true : undefined}
              className={cn('justify-start font-normal', error && 'border-danger-fg')}
            >
              {face}
              <ChevronsUpDown className="ml-auto text-text-muted" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-(--radix-popover-trigger-width) min-w-[min(280px,calc(100vw-32px))] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Find a person" />
              <CommandList>
                {loading ? <PickerSkeleton /> : <CommandEmpty>Nobody in this project can log time.</CommandEmpty>}
                {people.map(person => (
                  <CommandItem
                    key={person.username}
                    value={`${person.name} ${person.username}`}
                    onSelect={() => {
                      onChange(person);
                      setOpen(false);
                    }}
                  >
                    <MemberAvatar member={person} className="size-5" />
                    <PersonName person={person} className="min-w-0 flex-1 truncate" />
                    <span className="text-xs text-text-muted">@{person.username}</span>
                    <Check
                      className={cn('size-icon-sm', person.username === author.username ? 'opacity-100' : 'opacity-0')}
                    />
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <div aria-labelledby={`${id}-label`} className="flex h-control items-center gap-2 text-sm">
          {face}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface WorkTypeFieldProps {
  /** A work item attribute reuses the picker under its own name. */
  label?: string;
  emptyLabel?: string;
  value: string | null;
  letter: string | null;
  options: readonly { name: string; short_label: string }[];
  loading: boolean;
  error: string | null;
  onChange: (value: string | null) => void;
}

function WorkTypeField({
  label = 'Type',
  emptyLabel = NO_TYPE,
  value,
  letter,
  options,
  loading,
  error,
  onChange,
}: WorkTypeFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-text-secondary">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${id}-label`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'justify-start font-normal',
              error && 'border-danger-fg',
              !value && !loading && 'text-text-muted',
            )}
          >
            {loading ? (
              <Skeleton className="h-3 w-28" />
            ) : (
              <>
                {value && letter ? <LetterBadge letter={letter} label={value} variant="outlined" /> : null}
                <span className="truncate">{value ?? emptyLabel}</span>
              </>
            )}
            <ChevronsUpDown className="ml-auto text-text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) min-w-[min(280px,calc(100vw-32px))] p-0"
          align="start"
        >
          <ValueCommand
            placeholder={`Find ${label === 'Type' ? 'a work type' : label}`}
            loading={loading}
            selected={value ?? emptyLabel}
            options={[
              ...options.map(t => ({
                name: t.name,
                mark: <LetterBadge letter={t.short_label} label={t.name} variant="outlined" />,
              })),
              { name: emptyLabel },
            ]}
            onSelect={name => {
              onChange(name === emptyLabel ? null : name);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
