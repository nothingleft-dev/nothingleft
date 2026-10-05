'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useSearchParams } from 'next/navigation';
import type { Unsubscribe as UnsubscribePreview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { AuthHeading, FinePrint } from '@components/auth/auth-card';
import { FormAlert } from '@components/auth/form-alert';
import { useApplyUnsubscribe, useUnsubscribePreview } from '@hooks/use-notifications';
import { isApiError } from '@lib/api/errors';
import { KIND_COPY } from '@lib/notifications/kinds';

const SETTINGS = '/settings?tab=notifications' as Route;

const messageOf = (error: unknown) =>
  isApiError(error) ? error.message : 'The server could not be reached. Nothing was changed; try the link again.';

function whatItTurnsOff(preview: UnsubscribePreview) {
  if (preview.cadence) return `your ${preview.cadence} digest`;
  const names = preview.kinds.map(k => KIND_COPY[k].about);
  const list =
    names.length <= 1 ? (names[0] ?? 'these notifications') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `email about ${list}`;
}

/** Turns email off only on the button: a link scanner that opens the page changes nothing. */
export function Unsubscribe() {
  const token = useSearchParams().get('token');
  const preview = useUnsubscribePreview(token);
  const apply = useApplyUnsubscribe(token ?? '');

  if (!token || preview.isError) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading
          title="This unsubscribe link does not work"
          lede="It may have been copied only in part, or it comes from an older email."
        />
        {preview.isError ? <FormAlert title={messageOf(preview.error)} /> : null}
        <FinePrint>
          You can still choose exactly what you receive: sign in and open{' '}
          <Link href={SETTINGS}>Settings → Notifications</Link>.
        </FinePrint>
      </div>
    );
  }

  if (preview.isPending) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Reading the link">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const what = whatItTurnsOff(apply.data ?? preview.data);

  if (apply.isSuccess) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading
          title="You are unsubscribed"
          lede={`We turned off ${what}. Nothing else changed, and your inbox in the app still shows everything.`}
        />
        <Button asChild className="w-full">
          <Link href={SETTINGS}>Open Settings → Notifications</Link>
        </Button>
        <FinePrint>Changed your mind? Turn it back on there at any time.</FinePrint>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Unsubscribe from these emails?" lede={`This turns off ${what}.`} />
      {apply.isError ? <FormAlert title={messageOf(apply.error)} /> : null}
      <Button className="w-full" disabled={apply.isPending} onClick={() => apply.mutate()}>
        {apply.isPending ? 'Turning it off…' : 'Turn these emails off'}
      </Button>
      <FinePrint>
        Only that changes: other emails, account emails such as password resets, and your inbox in the app stay as they
        are. To choose kind by kind, open <Link href={SETTINGS}>Settings → Notifications</Link>.
      </FinePrint>
    </div>
  );
}
