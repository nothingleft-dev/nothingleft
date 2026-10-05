'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { SavedView, SavedViewVisibility } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { useApiError } from '@hooks/use-api-error';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useCreateSavedView, useUpdateSavedView } from '@hooks/use-saved-views';
import type { ColumnId } from '@lib/issue-list/columns';

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the bar holds now; saved with the view. */
  query: string;
  sort: string;
  columns: readonly ColumnId[];
  /** The project the list is scoped to, preselected for a project view. */
  project?: string;
  /** Editing this view's name and sharing instead of creating one. */
  existing?: SavedView | null;
  onSaved: (view: SavedView) => void;
}

const VISIBILITY: ChoiceOption<SavedViewVisibility>[] = [
  { value: 'private', label: 'Only you', hint: 'Appears in your tabs and sidebar; nobody else sees it.' },
  {
    value: 'project',
    label: 'Everyone in a project',
    hint: 'Every member of that project can use it and reference it as #{Name}.',
  },
  { value: 'org', label: 'Everyone in the organisation', hint: 'Every member of every project can use it.' },
];

export function SaveViewDialog({ open, onOpenChange, ...rest }: SaveViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so every opening starts from the props of that moment. */}
        {open ? <SaveViewForm {...rest} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SaveViewForm({
  query,
  sort,
  columns,
  project,
  existing,
  onSaved,
  onClose,
}: Omit<SaveViewDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const roles = useProjectRoles();
  const create = useCreateSavedView();
  const update = useUpdateSavedView();
  const pending = create.isPending || update.isPending;
  const error = useApiError(create.error ?? update.error);

  const [name, setName] = useState(existing?.name ?? '');
  const [visibility, setVisibility] = useState<SavedViewVisibility>(existing?.visibility ?? 'private');
  const [projectKey, setProjectKey] = useState<string | null>(existing?.project?.key ?? project ?? null);

  // docs/permissions.md: sharing needs Contributor somewhere; a project view, Contributor there.
  const canShare = roles.writable.length > 0;
  const projectOptions: ChoiceOption<string>[] = roles.writable.map(p => ({
    value: p.key,
    label: p.name,
    hint: p.key,
  }));
  const visibilityOptions = VISIBILITY.map(o =>
    o.value === 'private' || canShare ? o : { ...o, hint: `${o.hint} Needs Contributor in a project.` },
  );
  const chosenProject = projectKey ?? projectOptions[0]?.value ?? null;

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    const shared = { visibility, project: visibility === 'project' ? chosenProject : null };
    const done = (view: SavedView) => {
      toast.success(`Saved view ${view.name}.`);
      onSaved(view);
      onClose();
    };
    if (existing) {
      update.mutate({ name: existing.name, body: { name: trimmed, ...shared } }, { onSuccess: done });
      return;
    }
    create.mutate(
      { name: trimmed, query, ...shared, sort: sort || undefined, columns: [...columns] },
      { onSuccess: done },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? `Edit view ${existing.name}` : 'Save this search as a view'}</DialogTitle>
        <DialogDescription>
          {existing
            ? 'The query stays as it is; use the tab menu to save a new query into it.'
            : 'A view is a named search. Pin it as a tab, or reference it in any query as #{Name}.'}
        </DialogDescription>
      </DialogHeader>

      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        id="save-view"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Name"
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Blocking bugs"
          error={error.fields['name']}
          hint="No braces. Names are not case-sensitive."
        />
        {existing ? null : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Query</span>
            <code className="block rounded-md border bg-inset px-3 py-2 font-mono text-xs text-text-secondary [overflow-wrap:anywhere]">
              {query || '(everything)'}
              {sort ? <span className="text-text-muted"> · sort {sort}</span> : null}
            </code>
            {error.fields['query'] ? <p className="text-xs text-danger-fg">{error.fields['query']}</p> : null}
          </div>
        )}
        <ChoiceSelect
          label="Visible to"
          value={visibility}
          options={visibilityOptions}
          onChange={setVisibility}
          showHint
          disabled={!canShare}
        />
        {visibility === 'project' ? (
          <ChoiceSelect
            label="Project"
            value={chosenProject ?? ''}
            options={projectOptions}
            onChange={setProjectKey}
            disabled={projectOptions.length === 0}
          />
        ) : null}
        {error.fields['project'] ? <p className="text-xs text-danger-fg">{error.fields['project']}</p> : null}
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="save-view"
          disabled={pending || name.trim() === '' || (visibility === 'project' && !chosenProject)}
        >
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Save view'}
        </Button>
      </DialogFooter>
    </>
  );
}
