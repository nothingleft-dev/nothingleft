'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateProjectKey } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { BackButton, StepPanel } from '@components/onboarding/step-panel';
import { useApiError } from '@hooks/use-api-error';
import { useCreateProject } from '@hooks/use-projects';
import { isApiError } from '@lib/api/errors';

export function ProjectStep() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const create = useCreateProject();
  const error = useApiError(create.error);

  const derived = keyEdited ? key : (generateProjectKey(name) ?? '');
  // A taken key comes back with a free one in valid_values, so the fix is one click.
  const suggestion =
    isApiError(create.error) && create.error.code === 'project.key_taken' ? create.error.validValues?.[0] : undefined;

  return (
    <StepPanel
      eyebrow="Step 3 of 4"
      title="Create your first project"
      lede="Name your first project. This is where your team will track work."
      footer={
        <>
          <BackButton onClick={() => router.push('/welcome/organization')} disabled={create.isPending} />
          <Button type="submit" form="project-step" disabled={create.isPending || name.trim() === ''}>
            {create.isPending ? 'Creating…' : 'Save and continue'}
          </Button>
        </>
      }
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

      <form
        id="project-step"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
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
          error={error.fields['name']}
          onChange={e => setName(e.target.value)}
        />

        <Field
          label="Project key"
          placeholder="PP"
          hint={`Used in issue IDs, such as ${derived || 'PP'}-1. Use 2–10 letters or digits; you can change it until the first issue is created.`}
          className="font-mono tabular uppercase"
          value={derived}
          error={error.fields['key']}
          onChange={e => {
            setKeyEdited(true);
            setKey(e.target.value.toUpperCase());
          }}
        />
      </form>
    </StepPanel>
  );
}
