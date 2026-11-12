'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UpdateMeSchema, type Me } from '@nothingleft/types';
import { AvatarPicker } from '@components/avatar-picker';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { TimezonePicker, ZoneExample } from '@components/settings/timezone-picker';
import { StepPanel } from '@components/onboarding/step-panel';
import { VerifyGate, needsVerification } from '@components/onboarding/verify-gate';
import { useApiError } from '@hooks/use-api-error';
import { useUpdateMe } from '@hooks/use-me';
import { PendingButton } from '@components/pending-button';
import { useFieldProblems } from '@hooks/use-field-problems';

export function ProfileStep({ user }: { user: Me }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const update = useUpdateMe();
  const error = useApiError(update.error, ['name']);
  const local = useFieldProblems(UpdateMeSchema, { name: 'Full name' });
  const blocked = needsVerification(user);

  const save = () => {
    const changed = name.trim() !== user.name || timezone !== user.timezone;
    if (!changed) {
      router.push('/welcome/organization');
      return;
    }
    if (!local.check({ name, timezone })) return;
    update.mutate({ name: name.trim(), timezone }, { onSuccess: () => router.push('/welcome/organization') });
  };

  return (
    <StepPanel
      eyebrow="Step 1 of 4"
      title="Check your details"
      lede="Confirm your name and choose the time zone used to display dates and times."
      footer={
        <PendingButton
          type="submit"
          form="profile-step"
          disabled={blocked}
          pending={update.isPending}
          pendingLabel="Saving…"
        >
          Save and continue
        </PendingButton>
      }
    >
      {blocked ? <VerifyGate user={user} /> : null}

      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        id="profile-step"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Photo</span>
          <AvatarPicker user={user} />
          <p className="text-xs text-text-muted">
            Optional. We use your Gravatar or initials until you upload a photo.
          </p>
        </div>

        <Field
          label="Full name"
          autoComplete="name"
          value={name}
          error={local.problems['name'] ?? error.fields['name']}
          onChange={e => {
            setName(e.target.value);
            local.clear('name');
          }}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Time zone</span>
          <TimezonePicker value={timezone} onChange={setTimezone} />
          <ZoneExample timeZone={timezone} />
        </div>
      </form>
    </StepPanel>
  );
}
