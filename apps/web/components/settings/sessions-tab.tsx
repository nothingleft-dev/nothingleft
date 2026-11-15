'use client';

import { Globe, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Session } from '@nothingleft/types';
import { LoadError, errorDetail } from '@components/query-state';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { SettingsSection } from '@components/settings/section';
import { SettingsList, SettingsListRow, SettingsListSkeleton } from '@components/settings/settings-list';
import { countryName, describeDevice, type DeviceKind } from '@components/settings/session-device';
import { RelativeTime } from '@components/relative-time';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@hooks/use-sessions';

const DEVICE_ICONS: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
  unknown: Globe,
};

export function SessionsTab() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const others = (sessions.data ?? []).filter(s => !s.current).length;

  return (
    <SettingsSection
      title="Where you’re signed in"
      description="Every browser signed in to this account. Revoking one signs it out at once."
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
      {sessions.isPending ? <SettingsListSkeleton rows={3} label="Loading sessions" trailing={['w-16']} /> : null}
      {sessions.isError && !sessions.data ? (
        <LoadError onRetry={() => void sessions.refetch()} detail={errorDetail(sessions.error)}>
          Your sessions could not be loaded.
        </LoadError>
      ) : null}
      {sessions.isSuccess && sessions.data.length === 0 ? (
        <EmptyState title="No active sessions." description="Signing in from a browser adds one here." />
      ) : null}

      {sessions.isSuccess && sessions.data.length > 0 ? (
        <SettingsList>
          {sessions.data.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={() => revoke.mutate(session.id, { onSuccess: () => toast.success('Session revoked.') })}
            />
          ))}
        </SettingsList>
      ) : null}
    </SettingsSection>
  );
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: () => void }) {
  const device = describeDevice(session.user_agent);
  const Icon = DEVICE_ICONS[device.kind];
  const place = [countryName(session.country_code), session.ip].filter(Boolean).join(' · ') || 'Location unknown';

  return (
    <SettingsListRow>
      <Icon className="size-icon shrink-0 text-text-secondary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          {session.user_agent ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate">{device.name}</span>
              </TooltipTrigger>
              <TooltipContent className="font-mono text-2xs break-all">{session.user_agent}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="truncate">{device.name}</span>
          )}
          {session.current ? (
            <span className="h-4.5 shrink-0 rounded-xs border px-1.5 text-2xs leading-4 whitespace-nowrap text-text-secondary">
              This device
            </span>
          ) : null}
        </span>
        <span className="truncate text-xs text-text-secondary">
          {place} · last seen <RelativeTime value={session.last_seen_at} className="text-text-secondary" />
        </span>
      </div>
      {session.current ? null : (
        <Button variant="ghost" size="sm" onClick={onRevoke} className="shrink-0">
          Revoke
        </Button>
      )}
    </SettingsListRow>
  );
}
