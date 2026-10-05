'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { USER_THEMES, AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type Me, type UserTheme } from '@nothingleft/types';
import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { useApiError } from '@hooks/use-api-error';
import { SettingsSection } from '@components/settings/section';
import { TimezonePicker, ZoneExample } from '@components/settings/timezone-picker';
import { Segmented } from '@components/segmented';
import { useRemoveAvatar, useUpdateMe, useUpdatePreferences, useUploadAvatar } from '@hooks/use-me';
import { initialsOf } from '@lib/initials';

const THEME_OPTIONS = USER_THEMES.map(value => ({
  value,
  label: value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark',
}));

export function ProfileTab({ user }: { user: Me }) {
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const update = useUpdateMe();
  const error = useApiError(update.error);
  const dirty = name !== user.name || timezone !== user.timezone;

  return (
    <div className="flex flex-col gap-5">
      <AvatarSection user={user} />

      <SettingsSection title="Name" description="Shown on every issue, comment and mention you author.">
        {error.summary ? <FormAlert title={error.summary} /> : null}
        <form
          noValidate
          className="flex max-w-sm flex-col gap-3"
          onSubmit={event => {
            event.preventDefault();
            update.mutate({ name, timezone }, { onSuccess: () => toast.success('Profile saved.') });
          }}
        >
          <Field label="Full name" value={name} error={error.fields['name']} onChange={e => setName(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">Time zone</span>
            <TimezonePicker value={timezone} onChange={setTimezone} />
            <ZoneExample timeZone={timezone} />
          </div>
          <Button type="submit" disabled={!dirty || update.isPending} className="self-start">
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </SettingsSection>

      <ThemeSection user={user} />
    </div>
  );
}

function AvatarSection({ user }: { user: Me }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      toast.error('Use a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('That image is over 2MB.');
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success('Photo updated.'),
      onError: e => toast.error(e instanceof Error ? e.message : 'The upload failed.'),
    });
  };

  return (
    <SettingsSection
      title="Photo"
      description="PNG, JPEG or WebP, up to 2MB. Avatars never count toward your organisation’s storage."
      actions={
        <>
          <Button variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Photo removed.') })}
          >
            Remove
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-inset font-semibold text-text-secondary">
            {initialsOf(user.name)}
          </AvatarFallback>
        </Avatar>
        <p className="text-xs text-text-muted">
          Removing your photo falls back to your Gravatar, or to generated initials.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_MIME_TYPES.join(',')}
        hidden
        onChange={e => pick(e.target.files?.[0])}
      />
    </SettingsSection>
  );
}

function ThemeSection({ user }: { user: Me }) {
  const update = useUpdatePreferences();
  return (
    <SettingsSection
      title="Theme"
      description="Stored on your account, so it follows you to another device."
      actions={
        <Segmented
          ariaLabel="Theme"
          value={user.preferences.theme}
          options={THEME_OPTIONS}
          onChange={(theme: UserTheme) => update.mutate({ theme })}
        />
      }
    />
  );
}
