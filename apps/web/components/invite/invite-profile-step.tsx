'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import type { AcceptedInvitation, Me } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { AvatarPicker } from '@components/avatar-picker';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { TimezonePicker, ZoneExample } from '@components/settings/timezone-picker';
import { StepPanel } from '@components/onboarding/step-panel';
import { useApiError } from '@hooks/use-api-error';
import { useUpdateMe } from '@hooks/use-me';
import { useUpdateMember } from '@hooks/use-members';

interface InviteProfileStepProps {
  user: Me;
  accepted: AcceptedInvitation;
  stepNumber: number;
  stepCount: number;
}

export function InviteProfileStep({ user, accepted, stepNumber, stepCount }: InviteProfileStepProps) {
  const router = useRouter();
  const { organization, project_key } = accepted;
  const current = organization.membership.username;

  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [username, setUsername] = useState(current);

  const updateMe = useUpdateMe();
  const updateMember = useUpdateMember(organization.slug);
  const meError = useApiError(updateMe.error);
  const memberError = useApiError(updateMember.error);
  const isPending = updateMe.isPending || updateMember.isPending;

  const land = () => router.replace((project_key ? `/projects/${project_key}` : '/projects') as Route);

  const save = async () => {
    if (name.trim() !== user.name || timezone !== user.timezone) {
      await updateMe.mutateAsync({ name: name.trim(), timezone });
    }
    if (username.trim() !== current) {
      await updateMember.mutateAsync({ username: current, body: { username: username.trim() } });
    }
    land();
  };

  return (
    <StepPanel
      eyebrow={`Step ${stepNumber} of ${stepCount}`}
      title={`You’re in ${organization.name}`}
      lede="One last look at how you appear to everyone else here. All of it can be changed later."
      footer={
        <Button type="submit" form="invite-profile" disabled={isPending}>
          {isPending ? 'Saving…' : project_key ? `Go to ${project_key}` : 'Go to your projects'}
        </Button>
      }
    >
      {meError.summary ? <FormAlert title={meError.summary} /> : null}
      {memberError.summary ? <FormAlert title={memberError.summary} /> : null}

      <form
        id="invite-profile"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Photo</span>
          <AvatarPicker user={user} />
        </div>

        <Field
          label="Full name"
          autoComplete="name"
          value={name}
          error={meError.fields['name']}
          onChange={e => setName(e.target.value)}
        />

        <Field
          label={`Your username in ${organization.name}`}
          className="font-mono"
          hint="Letters, numbers, dots, hyphens and underscores. Mentions use it — @jordan.rivera — and it is yours in this organisation only."
          value={username}
          error={memberError.fields['username']}
          onChange={e => setUsername(e.target.value)}
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
