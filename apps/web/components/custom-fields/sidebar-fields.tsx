'use client';

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Pencil } from 'lucide-react';
import type { CustomField, CustomFieldValueInput, Issue, IssueCustomFieldValue } from '@nothingleft/types';
import { Popover, PopoverAnchor, PopoverContent } from '@components/popover';
import { Switch } from '@components/ui/switch';
import { LoadMore, TextButton } from '@components/text-button';
import { Markdown } from '@components/markdown/markdown';
import { SidebarField, useRailPopoverAlign } from '@components/issues/sidebar-field';
import { FieldValue, isEmptyValue } from '@components/custom-fields/field-value';
import {
  FieldEditor,
  MarkdownValueEditor,
  editorWidth,
  entryWith,
  inputOf,
  savesOnClose,
} from '@components/custom-fields/field-editors';
import { useCustomFields } from '@hooks/use-custom-fields';
import { useUpdateIssue } from '@hooks/use-issues';
import { useProjectAssignees } from '@hooks/use-projects';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

/** Values that close their picker the moment they are chosen; a refusal then shows under the row. */
const closesOnPick = (type: IssueCustomFieldValue['type']) => type === 'select' || type === 'user' || type === 'date';

interface SidebarCustomFieldsProps {
  issue: Issue;
  canEdit: boolean;
  timeZone?: string;
}

/** Every custom field the issue lists, in field order, below the built-in ones. */
export function SidebarCustomFields({ issue, canEdit, timeZone }: SidebarCustomFieldsProps) {
  const projectKey = issue.project.key;
  const fields = useCustomFields(projectKey);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, RowFailure>>({});
  const needsPeople = canEdit && issue.custom_fields.some(e => e.type === 'user' || e.type === 'multi_user');
  const people = useProjectAssignees(needsPeople ? projectKey : null);
  const calendar = useWorkCalendar();
  const update = useUpdateIssue(issue.key);

  const bySlug = new Map((fields.data ?? []).map(f => [f.slug, f]));
  // A field standing in for Estimation or Spent time is drawn in that built-in row instead.
  const entries = issue.custom_fields.filter(e => !bySlug.get(e.slug)?.time_role);
  if (entries.length === 0) return null;

  const setError = (slug: string, failure: RowFailure | null) =>
    setErrors(current => {
      const next = { ...current };
      if (failure) next[slug] = failure;
      else delete next[slug];
      return next;
    });

  const save = (entry: IssueCustomFieldValue, value: CustomFieldValueInput, closeOnSuccess: boolean) => {
    setError(entry.slug, null);
    const field = bySlug.get(entry.slug);
    update.mutate(
      {
        body: { custom_fields: { [entry.slug]: value } },
        optimistic: i => ({
          ...i,
          custom_fields: i.custom_fields.map(e =>
            e.slug === entry.slug ? entryWith(e, value, field, people.data ?? []) : e,
          ),
        }),
      },
      {
        onSuccess: () => closeOnSuccess && setOpen(current => (current === entry.slug ? null : current)),
        onError: error =>
          setError(entry.slug, {
            message: isApiError(error) ? error.message : 'Could not save.',
            // A refused value would only be refused again; a fault on our side or the network is worth repeating.
            retry: isApiError(error) && error.status < 500 ? undefined : () => save(entry, value, closeOnSuccess),
          }),
      },
    );
  };

  const openRow = (entry: IssueCustomFieldValue, next: boolean) => {
    if (next) {
      setError(entry.slug, null);
      if (savesOnClose(entry)) setDraft((inputOf(entry) as string[] | null) ?? []);
      setOpen(entry.slug);
      return;
    }
    setOpen(null);
    if (savesOnClose(entry)) {
      const before = ((inputOf(entry) as string[] | null) ?? []).toSorted();
      if (JSON.stringify(before) !== JSON.stringify(draft.toSorted())) save(entry, draft, false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5" aria-label="Custom fields">
      <RailHeading>Custom fields</RailHeading>
      {entries.map(entry => {
        const field = bySlug.get(entry.slug);
        const failure = errors[entry.slug] ?? null;
        const error = failure?.message ?? null;
        const rowError = <RowError name={entry.name} failure={failure} />;
        const editable = canEdit && field !== undefined;

        if (entry.type === 'checkbox') {
          return (
            <div key={entry.slug}>
              <CheckboxRow entry={entry} editable={editable} onChange={on => save(entry, on, false)} />
              {rowError}
            </div>
          );
        }

        if (entry.type === 'markdown') {
          return (
            <div key={entry.slug}>
              <BlockRow
                name={entry.name}
                verb="edit"
                editable={editable}
                open={open === entry.slug}
                onOpenChange={next => openRow(entry, next)}
                contentClassName="w-[560px]"
                editor={
                  <MarkdownValueEditor
                    label={entry.name}
                    value={entry.value}
                    projectKey={projectKey}
                    error={error}
                    onSave={value => save(entry, value, true)}
                    onCancel={() => setOpen(null)}
                  />
                }
              >
                {entry.value ? (
                  <ClampedMarkdown source={entry.value} />
                ) : (
                  <span
                    className={cn(
                      'self-start text-sm text-text-muted',
                      editable && 'edit-cue group-hover/field:decoration-text-secondary',
                    )}
                  >
                    {entry.empty_label}
                  </span>
                )}
              </BlockRow>
              {open === entry.slug ? null : rowError}
            </div>
          );
        }

        if (entry.type === 'url' && entry.value && field) {
          return (
            <div key={entry.slug}>
              <BlockRow
                name={entry.name}
                verb="change"
                editable={editable}
                open={open === entry.slug}
                onOpenChange={next => openRow(entry, next)}
                contentClassName={cn('w-[280px]', editorWidth(entry))}
                editor={
                  <FieldEditor
                    field={field}
                    value={inputOf(entry)}
                    people={people.data ?? []}
                    peopleLoading={people.isPending}
                    calendar={calendar}
                    projectKey={projectKey}
                    timeZone={timeZone}
                    error={error}
                    onSave={next => {
                      if (JSON.stringify(next) === JSON.stringify(inputOf(entry))) return setOpen(null);
                      save(entry, next, true);
                    }}
                    onToggle={setDraft}
                    onCancel={() => setOpen(null)}
                  />
                }
              >
                <UrlLink url={entry.value} />
              </BlockRow>
              {open === entry.slug ? null : rowError}
            </div>
          );
        }

        const value = savesOnClose(entry) && open === entry.slug ? draft : inputOf(entry);
        return (
          <div key={entry.slug}>
            <SidebarField
              label={entry.name}
              disabled={!editable}
              empty={isEmptyValue(entry)}
              mono={entry.type === 'duration' && !isEmptyValue(entry)}
              open={open === entry.slug}
              onOpenChange={next => openRow(entry, next)}
              contentClassName={editorWidth(entry)}
              editor={
                field ? (
                  <FieldEditor
                    field={field}
                    value={value}
                    people={people.data ?? []}
                    peopleLoading={people.isPending}
                    calendar={calendar}
                    projectKey={projectKey}
                    timeZone={timeZone}
                    error={error}
                    onSave={next => {
                      if (closesOnPick(entry.type)) setOpen(null);
                      if (JSON.stringify(next) === JSON.stringify(inputOf(entry))) return setOpen(null);
                      save(entry, next, true);
                    }}
                    onToggle={setDraft}
                    onCancel={() => setOpen(null)}
                  />
                ) : undefined
              }
            >
              <FieldValue
                entry={entry}
                calendar={calendar}
                variant="sidebar"
                timeZone={timeZone}
                decimals={field?.config.decimals}
              />
            </SidebarField>
            {open === entry.slug && !closesOnPick(entry.type) ? null : rowError}
          </div>
        );
      })}
    </div>
  );
}

interface RowFailure {
  message: string;
  retry?: (() => void) | undefined;
}

function RowError({ name, failure }: { name: string; failure: RowFailure | null }) {
  return failure ? (
    <p role="alert" className="-mt-1 px-2 pb-1 text-2xs text-danger-fg">
      Could not save {name}. {failure.message}
      {failure.retry ? (
        <>
          {' '}
          <TextButton onClick={failure.retry} className="text-2xs">
            Try again
          </TextButton>
        </>
      ) : null}
    </p>
  ) : null;
}

function CheckboxRow({
  entry,
  editable,
  onChange,
}: {
  entry: Extract<IssueCustomFieldValue, { type: 'checkbox' }>;
  editable: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-sm px-2 py-[7px]">
      <span className="text-2xs text-text-muted">{entry.name}</span>
      {editable ? (
        <span className="col-start-1 flex h-5 items-center">
          <Switch checked={entry.value} onCheckedChange={onChange} aria-label={entry.name} />
        </span>
      ) : (
        <span className="col-start-1 text-sm text-text">{entry.value ? 'Yes' : 'No'}</span>
      )}
    </div>
  );
}

interface BlockRowProps {
  name: string;
  /** Names the label button: `edit` for text, `change` for a value picked or typed in one field. */
  verb: 'edit' | 'change';
  editable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentClassName: string;
  editor: ReactNode;
  children: ReactNode;
}

/** A row whose value can hold links: its editor opens from the label and from any click that is not on one. */
function BlockRow({ name, verb, editable, open, onOpenChange, contentClassName, editor, children }: BlockRowProps) {
  const align = useRailPopoverAlign();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          data-state={open ? 'open' : 'closed'}
          onClick={
            editable
              ? event => {
                  if (!(event.target as HTMLElement).closest('a, button, input')) onOpenChange(true);
                }
              : undefined
          }
          className={cn(
            'flex flex-col gap-0.5 rounded-sm px-2 py-[7px]',
            editable && 'group/field cursor-pointer hover:bg-hover data-[state=open]:bg-hover',
          )}
        >
          {editable ? (
            <button
              type="button"
              aria-label={`${name}: ${verb}`}
              onClick={() => onOpenChange(true)}
              className="flex items-center gap-1.5 self-start rounded-xs text-left text-2xs text-text-muted"
            >
              {name}
              <Pencil
                aria-hidden
                className="size-2.5 opacity-0 transition-opacity duration-(--dur-fast) group-hover/field:opacity-100 group-data-[state=open]/field:opacity-100 [button:focus-visible>&]:opacity-100"
              />
            </button>
          ) : (
            <span className="text-2xs text-text-muted">{name}</span>
          )}
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align={align}
        side="bottom"
        collisionPadding={16}
        className={cn('max-w-[calc(100vw-32px)] p-0', contentClassName)}
      >
        {editor}
      </PopoverContent>
    </Popover>
  );
}

/** An address is a link first: it opens in a new tab, and the label is what changes it. */
function UrlLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/url self-start text-sm text-text [overflow-wrap:anywhere] hover:underline"
    >
      {url.split(/(?<=\/)/).map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
      <ExternalLink aria-label="opens in a new tab" className="ml-1 inline size-3 align-[-1px] text-text-muted" />
    </a>
  );
}

export function RailHeading({ children }: { children: string }) {
  return <h3 className="mx-2 mt-3 border-t pt-5 pb-1 text-sm font-semibold text-text">{children}</h3>;
}

/** Four lines, then a fade and Show more: a long note never pushes the fields under it out of view. */
function ClampedMarkdown({ source }: { source: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [source, expanded]);

  return (
    <>
      <div
        ref={box}
        className={cn(
          !expanded && 'max-h-20 overflow-hidden',
          !expanded && overflows && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-1.5rem),transparent)]',
        )}
      >
        <Markdown source={source} variant="comment" className="text-sm" />
      </div>
      {overflows ? (
        <LoadMore size="xs" className="mt-0.5 mb-2 self-start" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </LoadMore>
      ) : null}
    </>
  );
}

export const timeRoleField = (fields: readonly CustomField[] | undefined, role: CustomField['time_role']) =>
  fields?.find(f => f.time_role === role) ?? null;
