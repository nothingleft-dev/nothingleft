'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { PageSkeleton } from '@components/skeletons';
import { FormAlert } from '@components/auth/form-alert';
import { NotificationsTab } from '@components/settings/notifications-tab';
import { ProfileTab } from '@components/settings/profile-tab';
import { SecurityTab } from '@components/settings/security-tab';
import { SessionsTab } from '@components/settings/sessions-tab';
import { TokensTab } from '@components/settings/tokens-tab';
import { useSession } from '@hooks/use-session';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'tokens', label: 'Access tokens' },
  { value: 'notifications', label: 'Notifications' },
] as const;

type Tab = (typeof TABS)[number]['value'];

const isTab = (value: string | null): value is Tab => TABS.some(t => t.value === value);

export function AccountSettings() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = isTab(requested) ? requested : 'profile';
  const session = useSession();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        actions={
          <Segmented
            ariaLabel="Account settings"
            value={tab}
            options={TABS}
            onChange={next => router.replace(`/settings?tab=${next}`)}
          />
        }
      />

      {session.status === 'loading' ? <PageSkeleton rows={4} /> : null}
      {session.status === 'error' ? <FormAlert title="Your account could not be loaded." /> : null}
      {session.status === 'signed-out' ? <FormAlert title="Sign in to manage your account." /> : null}

      {session.status === 'signed-in' ? (
        <div className="max-w-3xl">
          {tab === 'profile' ? <ProfileTab user={session.user} /> : null}
          {tab === 'security' ? <SecurityTab user={session.user} /> : null}
          {tab === 'sessions' ? <SessionsTab /> : null}
          {tab === 'tokens' ? <TokensTab /> : null}
          {tab === 'notifications' ? <NotificationsTab user={session.user} /> : null}
        </div>
      ) : null}
    </div>
  );
}
