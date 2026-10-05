'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { CustomField, CustomFieldValueInput, Issue, IssueCustomFieldValue } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@components/ui/popover';
import { Switch } from '@components/ui/switch';
import { Markdown } from '@components/markdown/markdown';
import { SidebarField } from '@components/issues/sidebar-field';
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const needsPeople = canEdit && issue.custom_fields.some(e => e.type === 'user' || e.type === 'multi_user');
  const people = useProjectAssignees(needsPeople ? projectKey : null);
  const calendar = useWorkCalendar();
  const update = useUpdateIssue(issue.key);

  const bySlug = new Map((fields.data ?? []).map(f => [f.slug, f]));
  // A field standing in for Estimation or Spent time is drawn in that built-in row instead.
  const entries = issue.custom_fields.filter(e => !bySlug.get(e.slug)?.time_role);
  if (entries.length === 0) return null;

  const setError = (slug: string, message: string | null) =>
    setErrors(current => {
      const next = { ...current };
      if (message) next[slug] = message;
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
        onError: error => setError(entry.slug, isApiError(error) ? error.message : 'Could not save.'),
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
      <div className="mx-2 mt-2 border-t pt-4 pb-1 text-2xs font-medium text-text-muted">Fields</div>
      {entries.map(entry => {
        const field = bySlug.get(entry.slug);
        const error = errors[entry.slug] ?? null;
        const editable = canEdit && field !== undefined;

        if (entry.type === 'checkbox') {
          return (
            <div key={entry.slug}>
              <CheckboxRow entry={entry} editable={editable} onChange={on => save(entry, on, false)} />
              <RowError message={error} />
            </div>
          );
        }

        if (entry.type === 'markdown') {
          return (
            <div key={entry.slug}>
              <MarkdownRow
                entry={entry}
                editable={editable}
                projectKey={projectKey}
                open={open === entry.slug}
                error={error}
                onOpenChange={next => openRow(entry, next)}
                onSave={value => save(entry, value, true)}
              />
              {open === entry.slug ? null : <RowError message={error} />}
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
            {open === entry.slug && !closesOnPick(entry.type) ? null : <RowError message={error} />}
          </div>
        );
      })}
    </div>
  );
}

function RowError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="-mt-1 px-2 pb-1 text-2xs text-danger-fg">
      {message}
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
      <span className="col-start-1 text-sm text-text">{entry.value ? 'Yes' : 'No'}</span>
      {editable ? (
        <Switch
          checked={entry.value}
          onCheckedChange={onChange}
          aria-label={entry.name}
          className="col-start-2 row-span-2 row-start-1"
        />
      ) : null}
    </div>
  );
}

interface MarkdownRowProps {
  entry: { name: string; value: string | null; empty_label: string };
  editable: boolean;
  projectKey: string;
  open: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string | null) => void;
}

/** Rendered text can hold links, so it sits beside its edit button rather than inside it. */
function MarkdownRow({ entry, editable, projectKey, open, error, onOpenChange, onSave }: MarkdownRowProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div className="group/md flex flex-col gap-1 rounded-sm px-2 py-[7px]">
          <span className="flex items-center gap-1.5 text-2xs text-text-muted">
            {entry.name}
            {editable ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${entry.name}: edit`}
                className="-my-1 ml-auto size-5 text-text-secondary"
                onClick={() => onOpenChange(true)}
              >
                <Pencil className="size-3" />
              </Button>
            ) : null}
          </span>
          {entry.value ? (
            <div className="max-h-48 overflow-y-auto">
              <Markdown source={entry.value} variant="comment" className="text-sm" />
            </div>
          ) : editable ? (
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="self-start text-left text-sm text-text-muted underline decoration-border-strong decoration-dotted underline-offset-[5px] hover:decoration-text-secondary"
            >
              {entry.empty_label}
            </button>
          ) : (
            <span className="text-sm text-text-muted">{entry.empty_label}</span>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" side="left" className="w-[560px] max-w-[calc(100vw-32px)] p-0">
        <MarkdownValueEditor
          label={entry.name}
          value={entry.value}
          projectKey={projectKey}
          error={error}
          onSave={onSave}
          onCancel={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export const timeRoleField = (fields: readonly CustomField[] | undefined, role: CustomField['time_role']) =>
  fields?.find(f => f.time_role === role) ?? null;
