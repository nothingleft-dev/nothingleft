'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CreateProjectSchema, UpdateProjectSchema, type PaletteHue, type Project } from '@nothingleft/types';
import { generateProjectKey } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PaletteSwatches } from '@components/palette-swatches';
import { useApiError } from '@hooks/use-api-error';
import { useCreateProject, useUpdateProject } from '@hooks/use-projects';
import { PendingButton } from '@components/pending-button';
import { useFieldProblems } from '@hooks/use-field-problems';

export function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<PaletteHue>('blue');
  const create = useCreateProject();
  const error = useApiError(create.error, ['name', 'key']);
  const local = useFieldProblems(CreateProjectSchema, { name: 'Name' });

  const derived = keyEdited ? key : (generateProjectKey(name) ?? '');
  const suggestion = error.code === 'project.key_taken' ? error.validValues[0] : undefined;

  const close = () => {
    onOpenChange(false);
    setName('');
    setKey('');
    setKeyEdited(false);
    local.clear('name');
    create.reset();
  };

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            The key becomes the prefix on every issue in it, so short reads better: PP-14 rather than PARTNER-14.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-project"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (!local.check({ name })) return;
            create.mutate(
              { name: name.trim(), avatar_color: color, ...(derived ? { key: derived } : {}) },
              {
                onSuccess: project => {
                  toast.success(`${project.name} created.`);
                  close();
                },
              },
            );
          }}
        >
          {error.summary ? <FormAlert title={error.summary} /> : null}

          <Field
            label="Name"
            autoFocus
            placeholder="Partner Portal"
            value={name}
            error={local.problems['name'] ?? error.fields['name']}
            onChange={e => {
              setName(e.target.value);
              local.clear('name');
            }}
          />

          <Field
            label="Key"
            className="font-mono tabular uppercase"
            placeholder="PP"
            value={derived}
            error={error.fields['key']}
            errorAction={
              suggestion ? (
                <button
                  type="button"
                  className="action-link font-medium"
                  onClick={() => {
                    setKeyEdited(true);
                    setKey(suggestion);
                    create.reset();
                  }}
                >
                  Use {suggestion} instead
                </button>
              ) : null
            }
            onChange={e => {
              setKeyEdited(true);
              setKey(e.target.value.toUpperCase());
            }}
          />

          <PaletteSwatches value={color} onChange={setColor} />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <PendingButton
            type="submit"
            form="create-project"
            disabled={name.trim() === ''}
            pending={create.isPending}
            pendingLabel="Creating…"
          >
            Create project
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectGeneralForm({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [description, setDescription] = useState(project.description_md ?? '');
  const [color, setColor] = useState<PaletteHue>(project.avatar_color);
  const update = useUpdateProject(project.key);
  const error = useApiError(update.error, ['name', 'key']);
  const local = useFieldProblems(UpdateProjectSchema, { name: 'Name' });

  const dirty =
    name !== project.name ||
    key !== project.key ||
    description !== (project.description_md ?? '') ||
    color !== project.avatar_color;

  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      onSubmit={event => {
        event.preventDefault();
        if (!local.check({ name })) return;
        update.mutate(
          {
            name,
            ...(project.key_editable ? { key } : {}),
            description_md: description.trim() === '' ? null : description,
            avatar_color: color,
          },
          { onSuccess: () => toast.success('Project saved.') },
        );
      }}
    >
      {error.summary ? <FormAlert title={error.summary} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={name}
          disabled={!canEdit}
          error={local.problems['name'] ?? error.fields['name']}
          onChange={e => {
            setName(e.target.value);
            local.clear('name');
          }}
        />
        <Field
          label="Key"
          className="font-mono tabular uppercase"
          value={key}
          disabled={!canEdit}
          readOnly={!project.key_editable}
          error={error.fields['key']}
          hint={
            project.key_editable
              ? 'Fixed once the first issue is filed.'
              : `Fixed: ${project.key}-1 exists, and every key handed out would stop working.`
          }
          onChange={e => setKey(e.target.value.toUpperCase())}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="project-description" className="text-xs font-medium text-text-secondary">
          Description
        </label>
        <textarea
          id="project-description"
          rows={4}
          value={description}
          disabled={!canEdit}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this project is for. Markdown works."
          className="w-full rounded-md border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted hover:border-border-strong focus:border-border-strong disabled:opacity-50"
        />
      </div>

      <PaletteSwatches value={color} onChange={setColor} disabled={!canEdit} />

      {canEdit ? (
        <PendingButton
          type="submit"
          disabled={!dirty}
          className="self-start"
          pending={update.isPending}
          pendingLabel="Saving…"
        >
          Save changes
        </PendingButton>
      ) : (
        <p className="text-xs text-text-muted">Only a Project Admin can change these.</p>
      )}
    </form>
  );
}
