'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateProjectKey } from '@nothingleft/format';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { BackButton, StepPanel } from '@components/onboarding/step-panel';
import { useApiError } from '@hooks/use-api-error';
import { useCreateProject } from '@hooks/use-projects';
import { PendingButton } from '@components/pending-button';
import { CreateProjectSchema } from '@nothingleft/types';
import { useFieldProblems } from '@hooks/use-field-problems';

export function ProjectStep() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const create = useCreateProject();
  const error = useApiError(create.error, ['name', 'key']);
  const local = useFieldProblems(CreateProjectSchema, { name: 'Project name' });

  const derived = keyEdited ? key : (generateProjectKey(name) ?? '');
  const suggestion = error.code === 'project.key_taken' ? error.validValues[0] : undefined;

  return (
    <StepPanel
      eyebrow="Step 3 of 4"
      title="Create your first project"
      lede="Name your first project. This is where your team will track work."
      footer={
        <>
          <BackButton onClick={() => router.push('/welcome/organization')} disabled={create.isPending} />
          <PendingButton
            type="submit"
            form="project-step"
            disabled={name.trim() === ''}
            pending={create.isPending}
            pendingLabel="Creating…"
          >
            Save and continue
          </PendingButton>
        </>
      }
    >
      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        id="project-step"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
          if (!local.check({ name })) return;
          create.mutate(
            { name: name.trim(), ...(derived ? { key: derived } : {}) },
            { onSuccess: project => router.push(`/welcome/invite?project=${encodeURIComponent(project.key)}`) },
          );
        }}
      >
        <Field
          label="Project name"
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
          label="Project key"
          placeholder="PP"
          hint={`Used in issue IDs, such as ${derived || 'PP'}-1. Use 2–10 letters or digits; you can change it until the first issue is created.`}
          className="font-mono tabular uppercase"
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
      </form>
    </StepPanel>
  );
}
