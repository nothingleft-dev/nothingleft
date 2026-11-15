'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { AlertCircle, Link2, Lock, Plus, Tag, X } from 'lucide-react';
import { parseDuration, type WorkCalendar } from '@nothingleft/format';
import type { CustomField, CustomFieldValueInput, IssueLinkName, MemberRef, Project, TagRef } from '@nothingleft/types';
import { TitleInput } from '@components/title-input';
import { Duration } from '@components/duration';
import { Switch } from '@components/ui/switch';
import { FieldEditor, editorWidth } from '@components/custom-fields/field-editors';
import { OptionChip, markdownPreview } from '@components/custom-fields/field-value';
import { emptyLabelOf } from '@components/custom-fields/field-types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { ChoiceSelect } from '@components/choice-select';
import { IssueKey } from '@components/issue-key';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { LINK_OPTIONS, LinkTargetSearch, linkLabel } from '@components/issues/add-links-dialog';
import { TagChip, TagPicker } from '@components/issues/issue-tags';
import { MarkdownSizeNote } from '@components/issues/markdown-size-note';
import { MemberAvatar } from '@components/issues/member-avatar';
import { AssigneeCommand, DateEditor, EstimateEditor, ValueCommand, retryOf } from '@components/issues/pickers';
import { SidebarField } from '@components/issues/sidebar-field';
import { SprintCommand, StoryPointsEditor, UNSCHEDULED } from '@components/agile/sprint-field';
import { PriorityBadge, StatusDot, TypeBadge } from '@components/issues/value-marks';
import { draftSprint, draftValueOf, type DraftFields, type IssueDraft } from '@components/issues/use-issue-draft';
import { ProjectMark } from '@components/projects/project-mark';
import { useProjectAssignees } from '@hooks/use-projects';
import { useSchemaValues } from '@hooks/use-project-schema';
import { useSprints } from '@hooks/use-sprints';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { formatCalendarDate, formatDateTime } from '@lib/datetime';
import { cn } from '@lib/utils';

interface FieldSpec {
  id: string;
  label: string;
  /** Null renders the empty label. */
  value: ReactNode | null;
  /** The chip's muted text while unset; defaults to the label. */
  empty?: string;
  /** The issue page's wording, where a label already sits above the value: `?` for an unset estimate. */
  panelEmpty?: string;
  /** Names a set chip whose value alone does not say which field it is. */
  prefix?: string;
  loading?: boolean;
  /** Mark shown at the right of a panel row, as on the issue page. */
  aside?: ReactNode;
  /** Skeleton width for the chip's value while the project's values load. */
  loadingWidth?: string;
  editor: (close: () => void) => ReactNode;
  required?: boolean;
  /** Required, and still empty after a create was tried. */
  invalid?: boolean;
  contentClassName?: string;
}

function useFieldSpecs(
  project: Project,
  fields: DraftFields,
  setFields: IssueDraft['setFields'],
  customFields: readonly CustomField[] = [],
  missing: readonly CustomField[] = [],
): FieldSpec[] {
  const statuses = useSchemaValues(project.key, 'statuses');
  const priorities = useSchemaValues(project.key, 'priorities');
  const types = useSchemaValues(project.key, 'types');
  const people = useProjectAssignees(project.key);
  const sprints = useSprints(project.key);
  const calendar = useWorkCalendar();

  // Unset fields show the project default, so the reader sees what the issue will be created with.
  const type = types.data?.find(t => (fields.type ? t.name === fields.type : t.is_default));
  const priority = priorities.data?.find(p => (fields.priority ? p.name === fields.priority : p.is_default));
  const status = statuses.data?.find(s => (fields.status ? s.name === fields.status : s.is_default));
  const assigned = (people.data ?? []).filter(p => fields.assignees.includes(p.username));
  const sprint = draftSprint(fields, sprints.data);
  const set = (patch: Partial<DraftFields>) => setFields(f => ({ ...f, ...patch }));

  const specs: FieldSpec[] = [
    {
      id: 'type',
      label: 'Type',
      value: type ? type.name : null,
      loading: types.isPending,
      loadingWidth: 'w-7',
      aside: type ? <TypeBadge type={type} /> : undefined,
      editor: close => (
        <ValueCommand
          placeholder="Type"
          loading={types.isPending}
          onRetry={retryOf(types)}
          selected={type?.name ?? null}
          options={(types.data ?? []).map(t => ({ name: t.name, mark: <TypeBadge type={t} /> }))}
          onSelect={name => (set({ type: name }), close())}
        />
      ),
    },
    {
      id: 'priority',
      label: 'Priority',
      value: priority ? priority.name : null,
      loading: priorities.isPending,
      loadingWidth: 'w-12',
      aside: priority ? <PriorityBadge priority={priority} /> : undefined,
      editor: close => (
        <ValueCommand
          placeholder="Priority"
          loading={priorities.isPending}
          onRetry={retryOf(priorities)}
          selected={priority?.name ?? null}
          options={(priorities.data ?? []).map(p => ({ name: p.name, mark: <PriorityBadge priority={p} /> }))}
          onSelect={name => (set({ priority: name }), close())}
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      value: status ? (
        <>
          <StatusDot category={status.category} color={status.color} />
          {status.name}
        </>
      ) : null,
      loading: statuses.isPending,
      loadingWidth: 'w-10',
      editor: close => (
        <ValueCommand
          placeholder="Status"
          loading={statuses.isPending}
          onRetry={retryOf(statuses)}
          selected={status?.name ?? null}
          options={(statuses.data ?? [])
            .filter(s => !s.is_archived)
            .map(s => ({ name: s.name, mark: <StatusDot category={s.category} color={s.color} /> }))}
          onSelect={name => (set({ status: name }), close())}
        />
      ),
    },
    {
      id: 'assignees',
      label: 'Assignees',
      value:
        assigned.length === 0 ? null : (
          <>
            <span className="flex flex-none items-center">
              {assigned.slice(0, 2).map((a, i) => (
                <MemberAvatar
                  key={a.username}
                  member={a}
                  initialsClassName="text-[10px]"
                  className={cn('size-5 ring-[1.5px] ring-surface', i > 0 && '-ml-[2.5px]')}
                />
              ))}
            </span>
            {assigned.length === 1 ? assigned[0]!.name : `${assigned.length} people`}
          </>
        ),
      panelEmpty: 'Unassigned',
      editor: () => (
        <AssigneeCommand
          people={people.data ?? []}
          loading={people.isPending}
          onRetry={retryOf(people)}
          selected={fields.assignees}
          onToggle={username =>
            setFields(f => ({
              ...f,
              assignees: f.assignees.includes(username)
                ? f.assignees.filter(u => u !== username)
                : [...f.assignees, username],
            }))
          }
        />
      ),
    },
    {
      id: 'estimate',
      label: 'Estimation',
      value: fields.estimate ? <DraftDuration typed={fields.estimate} calendar={calendar} /> : null,
      prefix: 'Estimation',
      panelEmpty: '?',
      editor: close => (
        <EstimateEditor
          value={fields.estimate ? parseDuration(fields.estimate, calendar) : null}
          calendar={calendar}
          onSave={typed => (set({ estimate: typed ?? undefined }), close())}
        />
      ),
    },
    {
      id: 'start',
      label: 'Start date',
      value: fields.start_date ? formatCalendarDate(fields.start_date) : null,
      prefix: 'Start',
      panelEmpty: 'No start date',
      editor: close => (
        <DateField label="Start date">
          <DateEditor
            value={fields.start_date ?? null}
            onChange={v => (set({ start_date: v ?? undefined }), close())}
          />
        </DateField>
      ),
    },
    {
      id: 'due',
      label: 'Due date',
      value: fields.due_date ? formatCalendarDate(fields.due_date) : null,
      prefix: 'Due',
      panelEmpty: 'No due date',
      editor: close => (
        <DateField label="Due date">
          <DateEditor value={fields.due_date ?? null} onChange={v => (set({ due_date: v ?? undefined }), close())} />
        </DateField>
      ),
    },
    {
      id: 'sprint',
      label: 'Sprint',
      value: sprint ? sprint.name : null,
      empty: fields.sprint === null ? UNSCHEDULED : undefined,
      panelEmpty: UNSCHEDULED,
      editor: close => (
        <SprintCommand
          sprints={sprints.data ?? []}
          loading={sprints.isPending}
          selected={sprint?.slug ?? null}
          onSelect={slug => (set({ sprint: slug }), close())}
        />
      ),
    },
    {
      id: 'points',
      label: 'Story points',
      value:
        fields.story_points !== undefined ? (
          <span className="font-mono text-xs tabular">{fields.story_points}</span>
        ) : null,
      prefix: 'Story points',
      panelEmpty: '?',
      editor: close => (
        <StoryPointsEditor
          value={fields.story_points ?? null}
          onSave={points => (set({ story_points: points ?? undefined }), close())}
        />
      ),
    },
  ];
  const setCustom = (slug: string, value: CustomFieldValueInput) =>
    setFields(f => ({ ...f, custom: { ...f.custom, [slug]: value } }));
  const customSpecs = customFields.map((field): FieldSpec => {
    const value = draftValueOf(field, fields);
    return {
      id: `custom:${field.slug}`,
      label: field.name,
      value: draftDisplay(field, value, people.data ?? [], calendar),
      prefix: field.name,
      panelEmpty: emptyLabelOf(field),
      required: field.is_required,
      invalid: missing.some(m => m.slug === field.slug),
      contentClassName: editorWidth(field),
      editor: close =>
        field.type === 'checkbox' ? (
          <label className="flex items-center justify-between gap-3 p-3 text-sm">
            {field.name}
            <Switch checked={value === true} onCheckedChange={on => setCustom(field.slug, on)} />
          </label>
        ) : (
          <FieldEditor
            field={field}
            value={value}
            people={people.data ?? []}
            peopleLoading={people.isPending}
            calendar={calendar}
            projectKey={project.key}
            onSave={next => (setCustom(field.slug, next), close())}
            onToggle={next => setCustom(field.slug, next)}
            onCancel={close}
          />
        ),
    };
  });

  // A project that does not track time has no Estimation field to fill in.
  const builtIn = project.time_tracking_enabled ? specs : specs.filter(spec => spec.id !== 'estimate');
  return [...builtIn, ...customSpecs];
}

/** A draft value as the chip and panel show it, before the issue exists to render it. */
function draftDisplay(
  field: CustomField,
  value: CustomFieldValueInput,
  people: readonly MemberRef[],
  calendar: WorkCalendar,
): ReactNode | null {
  if (field.type === 'checkbox') return value === true ? 'Yes' : null;
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  const nameOf = (username: string) => people.find(p => p.username === username)?.name ?? `@${username}`;
  const color = (name: string) => field.options.find(o => o.name === name)?.color ?? 'gray-2';
  switch (field.type) {
    case 'select':
      return <OptionChip option={{ name: String(value), color: color(String(value)) }} />;
    case 'multi_select':
      return (value as string[]).join(', ');
    case 'user':
      return nameOf(String(value));
    case 'multi_user':
      return (value as string[]).length === 1
        ? nameOf((value as string[])[0]!)
        : `${(value as string[]).length} people`;
    case 'date':
      return formatCalendarDate(String(value));
    case 'datetime':
      return formatDateTime(String(value));
    case 'duration':
      return <DraftDuration typed={value as number | string} calendar={calendar} />;
    case 'number':
    case 'integer':
      return <span className="font-mono text-xs tabular">{String(value)}</span>;
    case 'markdown':
      return <span className="max-w-48 truncate">{markdownPreview(String(value))}</span>;
    default:
      return <span className="max-w-48 truncate">{String(value)}</span>;
  }
}

function DraftDuration({ typed, calendar }: { typed: number | string; calendar: WorkCalendar }) {
  const minutes = typeof typed === 'number' ? typed : parseDuration(typed, calendar);
  return minutes === null ? (
    <span className="font-mono text-xs tabular">{String(typed)}</span>
  ) : (
    <Duration minutes={minutes} calendar={calendar} className="text-xs [word-spacing:-0.25em]" />
  );
}

interface DraftFieldsProps {
  draft: IssueDraft;
  project: Project;
}

const isCustom = (spec: FieldSpec | undefined) => spec?.id.startsWith('custom:') ?? false;

// Fixed rows, so a value that widens one chip never moves another onto the next line.
const CHIP_ROW: Record<string, number> = { type: 0, priority: 0, status: 0, assignees: 0 };
const chipRowOf = (spec: FieldSpec) => (isCustom(spec) ? 2 : (CHIP_ROW[spec.id] ?? 1));

/** The dialog's compact rows: each chip names its field until it holds a value, then the value with its field. */
export function DraftChips({ draft, project }: DraftFieldsProps) {
  const specs = useFieldSpecs(project, draft.fields, draft.setFields, draft.applicableFields, draft.requiredMissing);
  const [open, setOpen] = useState<string | null>(null);
  const rows = [0, 1, 2].map(row => specs.filter(spec => chipRowOf(spec) === row));

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) =>
        row.length === 0 ? null : (
          <Fragment key={index}>
            {index === 2 ? <p className="pt-1.5 text-xs text-text-secondary">Custom fields</p> : null}
            <div className="flex flex-wrap gap-1.5">
              {row.map(spec => (
                <DraftChip
                  key={spec.id}
                  spec={spec}
                  open={open === spec.id}
                  onOpenChange={o => setOpen(o ? spec.id : null)}
                />
              ))}
            </div>
          </Fragment>
        ),
      )}
      <RequiredMissing draft={draft} />
    </div>
  );
}

interface DraftChipProps {
  spec: FieldSpec;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DraftChip({ spec, open, onOpenChange }: DraftChipProps) {
  // Dashed like the tag `+`: nothing is set yet, so the chip is an offer rather than a value.
  const unset = !spec.loading && spec.value === null && spec.empty === undefined;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          aria-label={spec.required ? `${spec.label}, required` : spec.label}
          aria-invalid={spec.invalid || undefined}
          title={spec.label}
          className={cn(
            'gap-1.5 font-normal',
            unset && 'border-dashed',
            spec.invalid && 'border-danger-fg text-danger-fg',
          )}
        >
          {spec.loading ? (
            <>
              <Skeleton className={spec.id === 'status' ? 'size-2 rounded-full' : 'size-4 rounded-xs'} />
              <Skeleton className={cn('h-3', spec.loadingWidth)} />
            </>
          ) : (
            <>
              {unset ? <Plus aria-hidden className="-ml-0.5 size-3 text-text-secondary" /> : null}
              {spec.aside}
              {spec.value !== null && spec.prefix ? <span className="text-text-secondary">{spec.prefix}</span> : null}
              {spec.value ?? (
                <span className={spec.invalid ? undefined : 'text-text-secondary'}>{spec.empty ?? spec.label}</span>
              )}
              {spec.required ? (
                <span aria-hidden className={cn('-ml-1', spec.invalid ? 'text-danger-fg' : 'text-text-secondary')}>
                  *
                </span>
              ) : null}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        collisionPadding={16}
        className={cn('w-[284px] p-0', spec.contentClassName)}
      >
        {spec.editor(() => onOpenChange(false))}
      </PopoverContent>
    </Popover>
  );
}

const PANEL_GROUP: Record<string, number> = {
  type: 0,
  priority: 0,
  status: 0,
  assignees: 1,
  estimate: 2,
  start: 2,
  due: 2,
  sprint: 3,
  points: 3,
};
const panelGroupOf = (spec: FieldSpec) => (isCustom(spec) ? 4 : (PANEL_GROUP[spec.id] ?? 2));

/** The full page's field column, the same rows as the issue page sidebar, grouped. */
export function DraftPanel({ draft, project }: DraftFieldsProps) {
  const specs = useFieldSpecs(project, draft.fields, draft.setFields, draft.applicableFields, draft.requiredMissing);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-0.5">
      {specs.map((spec, index) => (
        <Fragment key={spec.id}>
          {index > 0 && panelGroupOf(spec) !== panelGroupOf(specs[index - 1]!) ? (
            <div aria-hidden className="mx-2 my-1.5 h-px bg-border-subtle" />
          ) : null}
          <SidebarField
            label={spec.label}
            required={spec.required}
            invalid={spec.invalid}
            empty={spec.value === null}
            mono={spec.id === 'estimate' || spec.id === 'points'}
            open={open === spec.id}
            onOpenChange={o => setOpen(o ? spec.id : null)}
            contentClassName={cn('w-[284px]', spec.contentClassName)}
            editor={spec.editor(() => setOpen(null))}
          >
            {spec.loading ? (
              <Skeleton className="h-3.5 w-24" />
            ) : (
              <>
                {spec.aside}
                {spec.value ?? spec.panelEmpty ?? spec.label}
              </>
            )}
          </SidebarField>
        </Fragment>
      ))}
      <div className="px-2 pt-1 empty:hidden">
        <RequiredMissing draft={draft} />
      </div>
    </div>
  );
}

const listOf = (names: readonly string[]) =>
  names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function RequiredMissing({ draft }: { draft: IssueDraft }) {
  const missing = draft.requiredMissing;
  if (missing.length === 0) return null;
  const forType = draft.typeName ? `${draft.typeName} issues` : 'this type';
  return (
    <p role="alert" className="text-xs text-danger-fg">
      {listOf(missing.map(f => f.name))} {missing.length === 1 ? 'is' : 'are'} required for {forType}.
    </p>
  );
}

function DateField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="-mb-1 px-3 pt-3 text-2xs font-medium text-text-secondary">{label}</p>
      {children}
    </div>
  );
}

interface ProjectPickerProps {
  draft: IssueDraft;
  className?: string;
}

export function DraftProjectPicker({ draft, className }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const { project, writable } = draft;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className={cn('gap-1.5', className)} aria-label="Project">
          {project ? <ProjectMark project={project} size="xs" /> : null}
          {draft.projectsPending ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <span className="max-w-48 truncate">{project?.name ?? 'Choose a project'}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <ValueCommand
          placeholder="Find a project"
          selected={project?.name ?? null}
          options={writable.map(p => ({
            name: p.name,
            mark: <ProjectMark project={p} size="xs" />,
            hint: p.key,
          }))}
          onSelect={name => {
            const next = writable.find(p => p.name === name);
            if (next) draft.selectProject(next.key);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface DraftTextProps {
  draft: IssueDraft;
  large?: boolean;
  /** The full page has room to link issues before they exist; the quick dialog does not. */
  withLinks?: boolean;
}

/** Title with its quick actions, the tags it will carry, then the description on the same width. */
export function DraftText({ draft, large, withLinks = false }: DraftTextProps) {
  const [tagging, setTagging] = useState(false);
  const [linking, setLinking] = useState(draft.links.length > 0);

  const setTag = (tag: TagRef, on: boolean, isNew = false) =>
    draft.setTags(current => {
      const others = current.filter(t => t.slug !== tag.slug);
      return on ? [...others, { ...tag, isNew }] : others;
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-0.5 border-b border-border-strong focus-within:border-(--focus-soft) focus-within:shadow-[0_1px_0_0_var(--focus-soft)]">
        <label htmlFor="create-issue-title" className="sr-only">
          Title
        </label>
        <TitleInput
          id="create-issue-title"
          autoFocus
          value={draft.title}
          onValueChange={draft.setTitle}
          placeholder="Issue title"
          aria-invalid={Boolean(draft.error.fields['title'])}
          className={cn(
            'min-w-0 flex-1 bg-transparent py-1.5 font-semibold text-text [overflow-wrap:anywhere] placeholder:text-text-muted focus-visible:shadow-none',
            large ? 'text-2xl tracking-tight' : 'text-lg',
          )}
        />
        <DraftAction label="Add tag" onClick={() => setTagging(true)}>
          <Tag />
        </DraftAction>
        {withLinks ? (
          <DraftAction label="Add links" pressed={linking} onClick={() => setLinking(v => !v)}>
            <Link2 />
          </DraftAction>
        ) : null}
      </div>
      {draft.tags.length > 0 || tagging ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Tags">
          {draft.tags.map(t => (
            <TagChip key={t.slug} tag={t} onRemove={() => setTag(t, false)} />
          ))}
          <TagPicker
            applied={draft.tags}
            open={tagging}
            onOpenChange={setTagging}
            onChange={setTag}
            empty={draft.tags.length === 0}
          />
        </div>
      ) : null}
      <MarkdownEditor
        value={draft.description}
        onChange={draft.setDescription}
        projectKey={draft.project?.key ?? null}
        label="Description"
        placeholder="Add a description. Type @ to mention someone, # to link an issue."
        variant={large ? 'description' : 'comment'}
        // The chips stay near the title; a long description scrolls inside the editor, never the title away.
        minHeight={large ? 'min-h-40 md:min-h-80' : 'min-h-36 max-h-[40dvh] overflow-y-auto'}
        invalid={draft.size.level === 'too_large'}
        uploader={draft.uploader}
      />
      {withLinks && linking ? <DraftLinks draft={draft} onClose={() => setLinking(false)} /> : null}
      <MarkdownSizeNote size={draft.size} />
    </div>
  );
}

interface DraftActionProps {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function DraftAction({ label, pressed, onClick, children }: DraftActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            'inline-flex size-control flex-none items-center justify-center rounded-sm text-text-secondary hover:bg-hover hover:text-text [&_svg]:size-4',
            pressed && 'bg-active text-text',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DraftLinks({ draft, onClose }: { draft: IssueDraft; onClose: () => void }) {
  const [link, setLink] = useState<IssueLinkName>('relates to');
  // The parent has its own field; a second one here could only be refused.
  const options = LINK_OPTIONS.filter(o => !(draft.parent && o.value === 'subtask of'));

  return (
    <section aria-label="Links" className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add links</h3>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Close links" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        <ChoiceSelect label="Link" value={link} options={options} onChange={setLink} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Issues</span>
          <LinkTargetSearch
            projectKey={draft.project?.key ?? null}
            exclude={draft.links.filter(l => l.link === link).map(l => l.issue.key)}
            onPick={issue => draft.setLinks(current => [...current, { link, issue }])}
          />
        </div>
      </div>
      {draft.links.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
          {draft.links.map(({ link: name, issue }) => (
            <li key={`${name} ${issue.key}`} className="flex h-row items-center gap-2 pr-1 pl-2.5 text-sm">
              <span className="w-28 flex-none text-xs text-text-secondary">{linkLabel(name)}</span>
              <TypeBadge type={issue.type} />
              <IssueKey issueKey={issue.key} resolved={issue.resolved} column />
              <span className="min-w-0 flex-1 truncate">{issue.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${name} ${issue.key}`}
                onClick={() =>
                  draft.setLinks(current => current.filter(l => !(l.link === name && l.issue.key === issue.key)))
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function DraftParentChip({ draft }: { draft: IssueDraft }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-sm border pr-0.5 pl-2 text-xs text-text-secondary">
      Subtask of <span className="font-mono text-2xs text-text">{draft.parent}</span>
      <button
        type="button"
        aria-label="File as a standalone issue"
        onClick={() => draft.setParent(null)}
        className="inline-flex size-5 items-center justify-center rounded-xs text-text-muted hover:bg-hover hover:text-text"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Why the create failed, above or beside the button that retries it. */
export function DraftError({ draft, className }: { draft: IssueDraft; className?: string }) {
  const message = draft.failure;
  if (!message) return null;
  return (
    <p role="alert" className={cn('flex min-w-0 flex-1 items-start gap-1.5 text-xs text-danger-fg', className)}>
      <AlertCircle aria-hidden className="mt-px size-3.5 flex-none" />
      <span className="min-w-0">{message}</span>
    </p>
  );
}

export function NoWritableProject() {
  return (
    <div role="status" className="flex items-start gap-3">
      <Lock aria-hidden className="mt-0.5 size-icon-sm flex-none text-text-secondary" />
      <div className="flex flex-col gap-1">
        <p className="font-medium text-text">You cannot create issues in any project yet</p>
        <p className="text-text-secondary">Ask a Project Admin to make you a Contributor.</p>
      </div>
    </div>
  );
}
