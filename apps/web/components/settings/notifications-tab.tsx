'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import {
  NOTIFICATION_AREAS,
  type Me,
  type NotificationEmail,
  type NotificationKind,
  type NotificationPreference,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { ChoiceSelect } from '@components/choice-select';
import { FormAlert } from '@components/auth/form-alert';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@hooks/use-notifications';
import { isApiError } from '@lib/api/errors';
import { AREA_LABELS, EMAIL_OPTIONS, KIND_COPY } from '@lib/notifications/kinds';

const messageOf = (error: unknown) =>
  isApiError(error) ? error.message : 'Your choice was not saved. Check the connection and try again.';

export function NotificationsTab({ user }: { user: Me }) {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const rows = preferences.data?.preferences ?? [];
  const anyOn = rows.some(p => p.email !== 'off');

  const turnEverythingOff = () => {
    const before = Object.fromEntries(rows.filter(p => p.email !== 'off').map(p => [p.kind, p.email])) as Partial<
      Record<NotificationKind, NotificationEmail>
    >;
    update.mutate(
      { all: 'off' },
      {
        onSuccess: () =>
          toast.success('Every notification email is off.', {
            action: { label: 'Undo', onClick: () => update.mutate({ email: before }) },
          }),
        onError: error => toast.error(messageOf(error)),
      },
    );
  };

  const choose = (kind: NotificationKind, email: NotificationEmail) =>
    update.mutate({ email: { [kind]: email } }, { onError: error => toast.error(messageOf(error)) });

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Email"
        description="Your inbox always shows every notification; there is no switch for it. Email is off until you choose, kind by kind, and your choices apply in every organisation."
        actions={
          <Button variant="outline" disabled={!anyOn || update.isPending} onClick={turnEverythingOff}>
            Turn everything off
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          Digests arrive at 9am in your profile&apos;s time zone, {user.timezone} — daily every morning, weekly on
          Mondays — and only when something unread is waiting.{' '}
          <Link href={'/settings?tab=profile' as Route} className="text-text underline-offset-4 hover:underline">
            Change your time zone
          </Link>
        </p>
      </SettingsSection>

      {preferences.isPending ? <RowsSkeleton rows={8} /> : null}
      {preferences.isError ? (
        <FormAlert title="Your notification settings could not be loaded.">
          <button type="button" onClick={() => void preferences.refetch()}>
            Try again
          </button>
        </FormAlert>
      ) : null}

      {NOTIFICATION_AREAS.map(area => {
        const inArea = rows.filter(p => p.area === area);
        if (inArea.length === 0) return null;
        return (
          <SettingsSection key={area} title={AREA_LABELS[area]}>
            <ul className="flex flex-col divide-y divide-border-subtle">
              {inArea.map(p => (
                <PreferenceRow key={p.kind} preference={p} onChange={email => choose(p.kind, email)} />
              ))}
            </ul>
          </SettingsSection>
        );
      })}
    </div>
  );
}

function PreferenceRow({
  preference,
  onChange,
}: {
  preference: NotificationPreference;
  onChange: (email: NotificationEmail) => void;
}) {
  const copy = KIND_COPY[preference.kind];
  const options = EMAIL_OPTIONS.filter(o => preference.options.includes(o.value));
  const inAppOnly = options.length <= 1;

  return (
    <li className="flex min-h-row-lg items-center gap-4 py-2 max-sm:flex-col max-sm:items-start max-sm:gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{copy.label}</span>
          {preference.most_commonly_enabled ? (
            <span className="rounded-xs border px-1.5 text-2xs leading-4.5 text-text-secondary">
              Most commonly enabled
            </span>
          ) : null}
        </span>
        <span className="text-xs text-text-secondary">{copy.when}</span>
      </div>
      {inAppOnly ? (
        <span className="w-44 text-sm text-text-secondary max-sm:w-auto">In-app only</span>
      ) : (
        <ChoiceSelect
          label={`Email for ${copy.label}`}
          hideLabel
          className="w-44 max-sm:w-full"
          value={preference.email}
          options={options}
          onChange={onChange}
        />
      )}
    </li>
  );
}
