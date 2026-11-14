'use client';

import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { UpdateProjectSchema, type PaletteHue, type Project } from '@nothingleft/types';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { PaletteSwatches } from '@components/palette-swatches';
import { PendingButton } from '@components/pending-button';
import { Markdown } from '@components/markdown/markdown';
import { ProjectMark } from '@components/projects/project-mark';
import { useApiError } from '@hooks/use-api-error';
import { useFieldProblems } from '@hooks/use-field-problems';
import { useProjects, useUpdateProject } from '@hooks/use-projects';
import { cn } from '@lib/utils';

const keyLockedHint = (key: string) => `Locked because ${key}-1 exists. Changing it would break existing links.`;

export function ProjectGeneralForm({ project, canEdit }: { project: Project; canEdit: boolean }) {
  return canEdit ? <GeneralEditor project={project} /> : <GeneralValues project={project} />;
}

function GeneralEditor({ project }: { project: Project }) {
  const descriptionId = useId();
  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [description, setDescription] = useState(project.description_md ?? '');
  const [color, setColor] = useState<PaletteHue>(project.avatar_color);
  const update = useUpdateProject(project.key);
  const error = useApiError(update.error, ['name', 'key']);
  const local = useFieldProblems(UpdateProjectSchema, { name: 'Name' });
  const projects = useProjects({ archived: 'false' });
  const refusedKey = error.code === 'project.key_taken' ? update.variables?.key : undefined;
  const holder = refusedKey ? projects.data?.find(p => p.key === refusedKey)?.name : undefined;
  const keyError = refusedKey
    ? `${refusedKey} is used by ${holder ?? 'another project'}. Choose another key.`
    : error.fields['key'];

  const dirty =
    name !== project.name ||
    key !== project.key ||
    description !== (project.description_md ?? '') ||
    color !== project.avatar_color;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
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
          error={local.problems['name'] ?? error.fields['name']}
          onChange={e => {
            setName(e.target.value);
            local.clear('name');
          }}
        />
        {project.key_editable ? (
          <Field
            label="Key"
            className="font-mono tabular uppercase"
            value={key}
            error={keyError}
            hint="Fixed once the first issue is filed."
            onChange={e => setKey(e.target.value.toUpperCase())}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Key</span>
            <span className="flex h-control items-center font-mono text-sm tabular">{project.key}</span>
            <p className="text-xs text-text-secondary">{keyLockedHint(project.key)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={descriptionId} className="text-sm font-medium text-text-secondary">
          Description
        </label>
        <textarea
          id={descriptionId}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this project is for. Markdown works."
          className="field-sizing-content max-h-[calc(14lh+18px)] min-h-[calc(4lh+18px)] w-full resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted hover:border-border-strong focus:border-border-strong"
        />
      </div>

      <PaletteSwatches value={color} onChange={setColor} />

      <PendingButton
        type="submit"
        disabled={!dirty}
        className="self-start"
        pending={update.isPending}
        pendingLabel="Saving…"
      >
        Save changes
      </PendingButton>
    </form>
  );
}

/** What a Contributor, an Observer or anyone on an archived project sees: the values, not a disabled form. */
function GeneralValues({ project }: { project: Project }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Value label="Name">
        <span className="text-sm">{project.name}</span>
      </Value>
      <Value label="Key">
        <span className="font-mono text-sm tabular">{project.key}</span>
      </Value>
      <Value label="Description" className="sm:col-span-2">
        {project.description_md ? (
          <Markdown source={project.description_md} variant="comment" />
        ) : (
          <span className="text-sm text-text-secondary">No description.</span>
        )}
      </Value>
      <Value label="Colour" className="sm:col-span-2">
        <span className="flex items-center gap-2 text-sm">
          <ProjectMark project={project} size="sm" />
          <span className="capitalize">{project.avatar_color}</span>
        </span>
      </Value>
    </dl>
  );
}

function Value({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
