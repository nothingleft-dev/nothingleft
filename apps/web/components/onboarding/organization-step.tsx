'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateOrganizationSchema, type Me } from '@nothingleft/types';
import { generateOrganizationSlug } from '@nothingleft/format';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { BackButton, StepPanel } from '@components/onboarding/step-panel';
import { VerifyGate, needsVerification } from '@components/onboarding/verify-gate';
import { useApiError } from '@hooks/use-api-error';
import { useCreateOrganization } from '@hooks/use-organizations';
import { PendingButton } from '@components/pending-button';
import { useFieldProblems } from '@hooks/use-field-problems';

export function OrganizationStep({ user }: { user: Me }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const create = useCreateOrganization();
  const error = useApiError(create.error, ['name', 'slug']);
  const local = useFieldProblems(CreateOrganizationSchema, { name: 'Organisation name', slug: 'Organisation ID' });
  const blocked = needsVerification(user);

  const derived = slugEdited ? slug : (generateOrganizationSlug(name) ?? '');

  return (
    <StepPanel
      eyebrow="Step 2 of 4"
      title="Create your organisation"
      lede="Give your team’s workspace a name. Your projects and teammates will live here."
      footer={
        <>
          <BackButton onClick={() => router.push('/welcome')} disabled={create.isPending} />
          <PendingButton
            type="submit"
            form="organization-step"
            disabled={blocked || name.trim() === ''}
            pending={create.isPending}
            pendingLabel="Creating…"
          >
            Save and continue
          </PendingButton>
        </>
      }
    >
      {blocked ? <VerifyGate user={user} /> : null}

      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        id="organization-step"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
          if (!local.check({ name, ...(derived ? { slug: derived } : {}) })) return;
          create.mutate(
            { name: name.trim(), ...(derived ? { slug: derived } : {}) },
            { onSuccess: () => router.push('/welcome/project') },
          );
        }}
      >
        <Field
          label="Organisation name"
          autoFocus
          autoComplete="organization"
          placeholder="Acme Corporation"
          value={name}
          error={local.problems['name'] ?? error.fields['name']}
          onChange={e => {
            setName(e.target.value);
            local.clear('name');
          }}
        />

        <Field
          label="Organisation ID"
          placeholder="acme-corporation"
          hint="A unique ID for your workspace. Use lowercase letters, numbers and hyphens."
          value={derived}
          error={local.problems['slug'] ?? error.fields['slug']}
          onChange={e => {
            local.clear('slug');
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
        />
      </form>
    </StepPanel>
  );
}
