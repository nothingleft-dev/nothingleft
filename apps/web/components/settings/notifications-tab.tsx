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
import { LoadError, errorDetail } from '@components/query-state';
import { Skeleton } from '@components/ui/skeleton';
import { SettingsSection } from '@components/settings/section';
import { zoneLabel } from '@components/settings/timezone-picker';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@hooks/use-notifications';
import { useOrganizations } from '@hooks/use-organizations';
import { AREA_LABELS, EMAIL_OPTIONS, KIND_COPY } from '@lib/notifications/kinds';
import { toastError } from '@components/toast-error';

export function NotificationsTab({ user }: { user: Me }) {
  const preferences = useNotificationPreferences();
  // The development rows wait until a project the reader can see has a linked repository (plan § 14).
  const organizations = useOrganizations();
  const gitEnabled = organizations.data?.some(o => o.git_enabled) ?? false;
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
        onError: error => toastError('Could not turn the emails off', error),
      },
    );
  };

  const choose = (kind: NotificationKind, email: NotificationEmail) =>
    update.mutate({ email: { [kind]: email } }, { onError: error => toastError('Could not save your choice', error) });

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title="Email"
        description="Your inbox always shows every notification; there is no switch for it. Email is off until you choose, kind by kind, and your choices apply in every organisation."
      >
        <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
          Digests arrive at 9am in your profile’s time zone, {zoneLabel(user.timezone)} — daily every morning, weekly on
          Mondays — and only when something unread is waiting.{' '}
          <Link
            href={'/settings?tab=profile' as Route}
            className="action-link font-medium whitespace-nowrap text-text-secondary hover:text-text"
          >
            Change your time zone
          </Link>
        </p>
        <Button
          variant="outline"
          className="self-start"
          disabled={!anyOn || update.isPending}
          onClick={turnEverythingOff}
        >
          Turn every email off
        </Button>
      </SettingsSection>

      {preferences.isPending ? <PreferencesSkeleton /> : null}
      {preferences.isError ? (
        <LoadError onRetry={() => void preferences.refetch()} detail={errorDetail(preferences.error)}>
          Your notification settings could not be loaded.
        </LoadError>
      ) : null}

      {NOTIFICATION_AREAS.map(area => {
        const inArea = rows.filter(p => p.area === area);
        if (inArea.length === 0 || (area === 'development' && !gitEnabled)) return null;
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

// The picker sits beside its words, not at the far edge of a fluid page.
const ROW =
  'grid min-h-row-lg grid-cols-[minmax(0,26rem)_11rem] items-center gap-x-8 py-2 max-sm:grid-cols-1 max-sm:gap-y-2';

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
    <li className={ROW}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span>{copy.label}</span>
          {preference.most_commonly_enabled ? (
            <span className="rounded-xs border px-1.5 text-2xs leading-4.5 text-text-secondary">
              Most commonly enabled
            </span>
          ) : null}
        </span>
        <span className="text-xs text-text-secondary">{copy.when}</span>
      </div>
      {inAppOnly ? (
        <span className="text-sm text-text-secondary">In-app only</span>
      ) : (
        <ChoiceSelect
          label={`Email for ${copy.label}`}
          hideLabel
          className="w-full"
          align="end"
          quietValue="off"
          value={preference.email}
          options={options}
          onChange={onChange}
        />
      )}
    </li>
  );
}

function PreferencesSkeleton() {
  return (
    <section className="flex flex-col gap-3" role="status" aria-label="Loading notification settings">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-16" />
      </div>
      <div className="flex flex-col divide-y divide-border-subtle">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={ROW}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-full" style={{ maxWidth: `${18 + ((i * 7) % 12)}%` }} />
              </div>
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-full" style={{ maxWidth: `${30 + ((i * 11) % 20)}%` }} />
              </div>
            </div>
            <Skeleton className="h-control w-full rounded-md max-sm:hidden" />
          </div>
        ))}
      </div>
    </section>
  );
}
