'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { AvatarPicker } from '@components/avatar-picker';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { TimezonePicker, ZoneExample } from '@components/settings/timezone-picker';
import { StepPanel } from '@components/onboarding/step-panel';
import { VerifyGate, needsVerification } from '@components/onboarding/verify-gate';
import { useApiError } from '@hooks/use-api-error';
import { useUpdateMe } from '@hooks/use-me';

export function ProfileStep({ user }: { user: Me }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const update = useUpdateMe();
  const error = useApiError(update.error);
  const blocked = needsVerification(user);

  const save = () => {
    const changed = name.trim() !== user.name || timezone !== user.timezone;
    if (!changed) {
      router.push('/welcome/organization');
      return;
    }
    update.mutate({ name: name.trim(), timezone }, { onSuccess: () => router.push('/welcome/organization') });
  };

  return (
    <StepPanel
      eyebrow="Step 1 of 4"
      title="Check your details"
      lede="Confirm your name and choose the time zone used to display dates and times."
      footer={
        <Button type="submit" form="profile-step" disabled={update.isPending || blocked}>
          {update.isPending ? 'Saving…' : 'Save and continue'}
        </Button>
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
          error={error.fields['name']}
          onChange={e => setName(e.target.value)}
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
