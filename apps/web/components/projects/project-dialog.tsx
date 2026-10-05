'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { PaletteHue, Project } from '@nothingleft/types';
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
import { isApiError } from '@lib/api/errors';

export function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<PaletteHue>('blue');
  const create = useCreateProject();
  const error = useApiError(create.error);

  const derived = keyEdited ? key : (generateProjectKey(name) ?? '');
  const suggestion =
    isApiError(create.error) && create.error.code === 'project.key_taken' ? create.error.validValues?.[0] : undefined;

  const close = () => {
    onOpenChange(false);
    setName('');
    setKey('');
    setKeyEdited(false);
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
          {error.summary ? (
            <FormAlert title={error.summary}>
              {suggestion ? (
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => {
                    setKeyEdited(true);
                    setKey(suggestion);
                  }}
                >
                  Use {suggestion} instead
                </button>
              ) : null}
            </FormAlert>
          ) : null}

          <Field
            label="Name"
            autoFocus
            placeholder="Partner Portal"
            value={name}
            error={error.fields['name']}
            onChange={e => setName(e.target.value)}
          />

          <Field
            label="Key"
            className="font-mono tabular uppercase"
            placeholder="PP"
            value={derived}
            error={error.fields['key']}
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
          <Button type="submit" form="create-project" disabled={create.isPending || name.trim() === ''}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </Button>
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
  const error = useApiError(update.error);

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
          error={error.fields['name']}
          onChange={e => setName(e.target.value)}
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
        <Button type="submit" disabled={!dirty || update.isPending} className="self-start">
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      ) : (
        <p className="text-xs text-text-muted">Only a Project Admin can change these.</p>
      )}
    </form>
  );
}
