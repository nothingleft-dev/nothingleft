'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me } from '@nothingleft/types';
import { generateOrganizationSlug } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { BackButton, StepPanel } from '@components/onboarding/step-panel';
import { VerifyGate, needsVerification } from '@components/onboarding/verify-gate';
import { useApiError } from '@hooks/use-api-error';
import { useCreateOrganization } from '@hooks/use-organizations';

export function OrganizationStep({ user }: { user: Me }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const create = useCreateOrganization();
  const error = useApiError(create.error);
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
          <Button type="submit" form="organization-step" disabled={create.isPending || blocked || name.trim() === ''}>
            {create.isPending ? 'Creating…' : 'Save and continue'}
          </Button>
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
          error={error.fields['name']}
          onChange={e => setName(e.target.value)}
        />

        <Field
          label="Organisation ID"
          placeholder="acme-corporation"
          hint="A unique ID for your workspace. Use lowercase letters, numbers and hyphens."
          value={derived}
          error={error.fields['slug']}
          onChange={e => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
        />
      </form>
    </StepPanel>
  );
}
