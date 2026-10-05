'use client';

import { Monitor } from 'lucide-react';
import { toast } from 'sonner';
import type { Session } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { RelativeTime } from '@components/relative-time';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@hooks/use-sessions';

export function SessionsTab() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const others = (sessions.data ?? []).filter(s => !s.current).length;

  return (
    <SettingsSection
      title="Active sessions"
      description="Every browser signed in to this account. Revoking one takes effect immediately."
      actions={
        <Button
          variant="outline"
          disabled={others === 0 || revokeOthers.isPending}
          onClick={() =>
            revokeOthers.mutate(undefined, { onSuccess: () => toast.success('Signed out everywhere else.') })
          }
        >
          Sign out everywhere else
        </Button>
      }
    >
      {sessions.isPending ? <RowsSkeleton rows={3} /> : null}
      {sessions.isError ? <FormAlert title="Your sessions could not be loaded." /> : null}
      {sessions.isSuccess && sessions.data.length === 0 ? (
        <EmptyState title="No active sessions." description="Signing in from a browser adds one here." />
      ) : null}

      {sessions.isSuccess && sessions.data.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {sessions.data.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={() => revoke.mutate(session.id, { onSuccess: () => toast.success('Session revoked.') })}
            />
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: () => void }) {
  return (
    <li className="flex min-h-row items-center gap-3 py-2">
      <Monitor className="size-icon shrink-0 text-text-muted" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">
          {session.user_agent ?? 'Unknown device'}
          {session.current ? <span className="ml-2 text-xs text-brand-text">this device</span> : null}
        </span>
        <span className="text-xs text-text-muted">
          {[session.country_code, session.ip].filter(Boolean).join(' · ') || 'Location unknown'} · last seen{' '}
          <RelativeTime value={session.last_seen_at} />
        </span>
      </div>
      <Button variant="ghost" size="sm" disabled={session.current} onClick={onRevoke} className="ml-auto shrink-0">
        {session.current ? 'Current' : 'Revoke'}
      </Button>
    </li>
  );
}
