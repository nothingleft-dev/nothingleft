'use client';

import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { ArrowLeft, ExternalLink, KeyRound, MoreHorizontal, RefreshCw, ScrollText, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import {
  PLAN_PRESETS,
  type GitConnection,
  type GitConnectionSecret,
  type GitProviderInfo,
  type MemberGitIdentity,
  type Organization,
} from '@nothingleft/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ConfirmDialog } from '@components/confirm-dialog';
import { CopyButton } from '@components/copy-button';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { SettingsSection } from '@components/settings/section';
import { TableSkeleton } from '@components/skeletons';
import { HueChip } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { PLAN_LABELS } from '@components/organization/plan-tab';
import { ConnectSheet, type ConnectTarget } from '@components/organization/integrations/connect-sheet';
import { SecretDialog } from '@components/organization/integrations/secret-dialog';
import { DeliveryLog } from '@components/organization/integrations/delivery-log';
import { ConnectionRepositories } from '@components/organization/integrations/connection-repositories';
import {
  useGitConnections,
  useGitProviders,
  useMemberGitIdentities,
  useRefreshGitConnection,
  useRemoveGitConnection,
  useRemoveMemberGitIdentity,
  useRotateGitSecret,
  useStartGitHubConnect,
} from '@hooks/use-git';
import { CONNECTION_REASON, HEALTH, capitalize, count, providerLabel, type Hue } from '@lib/git/words';
import { formatDate, formatDateTimeWithZone } from '@lib/datetime';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

const AUTH_KIND = { app_installation: 'App installation', token: 'Access token', manual: 'Webhook by hand' } as const;
const PLAN_TAB = '/organization?tab=plan' as Route;

export function IntegrationsTab({ organization }: { organization: Organization }) {
  const slug = organization.slug;
  const router = useRouter();
  const params = useSearchParams();
  const providers = useGitProviders();
  const connections = useGitConnections(slug);
  const identities = useMemberGitIdentities(slug);
  const [connecting, setConnecting] = useState<ConnectTarget | null>(null);
  const [secret, setSecret] = useState<{ connection: GitConnectionSecret; rotated: boolean } | null>(null);
  const [log, setLog] = useState<{ connection: string; repository: string | null } | null>(null);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.set('tab', 'integrations');
    router.replace(`/organization?${next.toString()}` as Route, { scroll: false });
  };

  const list = connections.data ?? [];
  const live = list.filter(c => c.revoked_at === null);
  const sorted = [...live].sort((a, b) => severity(b) - severity(a));
  const open = live.find(c => c.name === params.get('connection')) ?? null;
  const logConnection = log ? (list.find(c => c.name === log.connection) ?? null) : null;
  const limit = PLAN_PRESETS[organization.plan].git_connections;
  const atLimit = limit !== null && live.length >= limit;
  const failed = <T,>(query: UseQueryResult<T>) => query.isError && query.data === undefined;

  const deliveryLog = (
    <DeliveryLog
      slug={slug}
      connection={logConnection}
      repository={log?.repository ?? null}
      open={log !== null}
      onOpenChange={value => (value ? null : setLog(null))}
    />
  );
  const dialogs = (
    <>
      <ConnectSheet
        slug={slug}
        target={connecting}
        onClose={() => setConnecting(null)}
        onConnected={connection => {
          setConnecting(null);
          // Only a webhook added by hand needs its secret; registered hooks carry their own token.
          if (connection.auth_kind === 'manual' && connection.webhook_secret) setSecret({ connection, rotated: false });
          else toast.success(`${connection.account.login} on ${providerLabel(connection.provider)} is connected.`);
        }}
      />
      <SecretDialog
        connection={secret?.connection ?? null}
        rotated={secret?.rotated ?? false}
        onClose={() => setSecret(null)}
      />
      {deliveryLog}
    </>
  );

  if (open) {
    return (
      <>
        <ConnectionDetail
          slug={slug}
          connection={open}
          onBack={() => setParams({ connection: null })}
          onLog={repository => setLog({ connection: open.name, repository })}
          onRotated={connection => setSecret({ connection, rotated: true })}
        />
        {dialogs}
      </>
    );
  }

  const planLabel = PLAN_LABELS[organization.plan];
  const connectDescription =
    limit === null
      ? 'Connect as many GitHub and GitLab accounts as you need.'
      : `${planLabel} allows ${count(limit, 'connection')}. Each GitHub or GitLab account you connect is one.`;

  // The list decides the height of everything under it, so the tab appears in one piece.
  if (connections.isPending) {
    return (
      <div key="pending" className="flex flex-col gap-5">
        <SettingsSection title="Connected accounts" description={CONNECTED_DESCRIPTION}>
          <ConnectionsSkeleton />
        </SettingsSection>
        <SettingsSection title="Connect an account" description={connectDescription}>
          <ProvidersSkeleton />
        </SettingsSection>
        <SettingsSection title="Members’ git identities" description={IDENTITIES_DESCRIPTION}>
          <IdentitiesSkeleton />
        </SettingsSection>
      </div>
    );
  }

  return (
    <div key="ready" className="flex flex-col gap-5">
      <AttentionSummary connections={live} />

      <SettingsSection title="Connected accounts" description={CONNECTED_DESCRIPTION}>
        {failed(connections) ? (
          <LoadError onRetry={() => void connections.refetch()} detail={errorDetail(connections.error)}>
            The connections could not be loaded.
          </LoadError>
        ) : live.length === 0 ? (
          <EmptyState
            title="No account is connected yet."
            description="Connect one below. Then link its repositories to projects in each project’s settings."
          />
        ) : (
          <ul className="divide-y divide-border-subtle rounded-md border">
            {sorted.map(connection => (
              <ConnectionRow
                key={connection.name}
                slug={slug}
                connection={connection}
                onOpen={() => setParams({ connection: connection.name })}
                onLog={() => setLog({ connection: connection.name, repository: null })}
                onRotated={c => setSecret({ connection: c, rotated: true })}
              />
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="Connect an account" description={connectDescription}>
        {atLimit ? (
          <div id="git-connection-limit">
            <FormAlert tone="warning" title={`${live.length} of ${limit} connections in use on ${planLabel}.`}>
              Disconnect {live.length > limit ? live.length - limit + 1 : 'one'} to connect another, or{' '}
              <Link href={PLAN_TAB}>see the plan</Link>.
            </FormAlert>
          </div>
        ) : null}
        {providers.isPending ? (
          <ProvidersSkeleton />
        ) : failed(providers) || !providers.data ? (
          <LoadError onRetry={() => void providers.refetch()} detail={errorDetail(providers.error)}>
            The providers could not be loaded.
          </LoadError>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.data.map(provider => (
              <ProviderCard
                key={provider.kind}
                slug={slug}
                provider={provider}
                blocked={atLimit}
                onConnect={setConnecting}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <MemberIdentities slug={slug} identities={identities} />

      {dialogs}
    </div>
  );
}

const CONNECTED_DESCRIPTION =
  'GitHub and GitLab accounts whose repositories can feed issues. A connection only reads: it never comments, sets statuses or pushes.';
const IDENTITIES_DESCRIPTION =
  'Logins and verified emails members have added, so commits and pull requests show under their name. Attribution only, never sign-in.';

type Severity = 'stopped' | 'at_risk' | 'healthy';

function severityOf(connection: GitConnection): Severity {
  if (connection.health === 'active') return connection.repositories.webhooks_missing > 0 ? 'at_risk' : 'healthy';
  return connection.health === 'expiring' ? 'at_risk' : 'stopped';
}

const SEVERITY_RANK: Record<Severity, number> = { stopped: 2, at_risk: 1, healthy: 0 };

function severity(connection: GitConnection): number {
  return SEVERITY_RANK[severityOf(connection)];
}

function AttentionSummary({ connections }: { connections: GitConnection[] }) {
  const stopped = connections.filter(c => severityOf(c) === 'stopped');
  const expiring = connections.filter(c => c.health === 'expiring');
  if (stopped.length === 0 && expiring.length === 0) return null;

  const soonest = expiring
    .map(c => c.token_expires_at)
    .filter((at): at is string => at !== null)
    .sort()[0];
  const parts = [
    stopped.length > 0
      ? `${count(stopped.length, 'connection')} ${stopped.length === 1 ? 'has' : 'have'} stopped receiving activity`
      : null,
    expiring.length === 1 && soonest
      ? `1 token expires ${formatDate(soonest)}`
      : expiring.length > 0
        ? `${expiring.length} tokens expire soon`
        : null,
  ].filter(Boolean);

  return (
    <FormAlert tone={stopped.length > 0 ? 'danger' : 'warning'} title={`${parts.join(' · ')}.`}>
      What is already linked stays. Each connection below says what to fix.
    </FormAlert>
  );
}

type FixAction = { kind: 'rotate' } | { kind: 'log' } | { kind: 'external'; href: string; label: string };

interface Fix {
  problem: string;
  remedy: string;
  action?: FixAction;
}

/** What went wrong and what to do about it, in one line under the row and in the detail's alert. */
function fixFor(connection: GitConnection): Fix | null {
  const provider = providerLabel(connection.provider);
  const reconnect = `Make a new token on ${provider}, then disconnect and reconnect with it.`;
  const rotate: FixAction = { kind: 'rotate' };
  const settings: FixAction = {
    kind: 'external',
    href: connection.redelivery_url ?? connection.account.url,
    label: `Open ${provider}`,
  };

  if (connection.health === 'active') {
    const missing = connection.repositories.webhooks_missing;
    return missing > 0
      ? {
          problem: `${count(missing, 'linked repository has', 'linked repositories have')} no webhook.`,
          remedy: `Choose Re-register webhook in ${missing === 1 ? 'its' : 'each one’s'} menu, under the connection’s repositories.`,
        }
      : null;
  }
  if (connection.health === 'expiring') {
    return {
      problem: connection.token_expires_at
        ? `Its access token expires ${formatDate(connection.token_expires_at)}.`
        : 'Its access token expires soon.',
      remedy: `Before then, make a new token on ${provider} and reconnect with it.`,
    };
  }
  if (connection.health === 'removed_at_provider') {
    return {
      problem: `The account no longer exists on ${provider}.`,
      remedy: 'Disconnect it from the menu; what is already linked stays.',
    };
  }
  if (connection.health === 'suspended' || connection.last_error === 'suspended') {
    return {
      problem: `The app was suspended on ${provider}.`,
      remedy: 'Unsuspend it in the installation’s settings there.',
      action: settings,
    };
  }
  switch (connection.last_error) {
    case 'signature':
      return {
        problem: 'Deliveries fail the signature check.',
        remedy:
          connection.auth_kind === 'manual'
            ? 'Rotate the webhook secret and paste the new one into each webhook.'
            : 'Rotate the webhook secrets; each webhook gets its new one.',
        action: rotate,
      };
    case 'processing':
      return {
        problem: 'Deliveries keep failing to process.',
        remedy: 'The delivery log says why each one failed.',
        action: { kind: 'log' },
      };
    case 'token_expired':
      return { problem: 'Its access token has expired.', remedy: reconnect };
    case 'token_invalid':
      return { problem: `${provider} refused its access token.`, remedy: reconnect };
    case 'uninstalled':
      return {
        problem: `The app was uninstalled on ${provider}.`,
        remedy: 'Install it again and connect, or disconnect this connection.',
      };
    default: {
      const reason = connection.last_error ? CONNECTION_REASON[connection.last_error] : null;
      return {
        problem: reason ? `${capitalize(reason)}.` : 'New activity may not be arriving.',
        remedy: 'The delivery log shows the latest failures.',
        action: { kind: 'log' },
      };
    }
  }
}

const FIX_TONE: Record<Severity, string> = { stopped: 'text-danger-fg', at_risk: 'text-warning-fg', healthy: '' };

interface FixProps {
  connection: GitConnection;
  fix: Fix;
  onRotate: () => void;
  onLog: () => void;
}

function FixLine(props: FixProps) {
  return (
    <p className="max-w-[80ch] text-xs text-pretty text-text">
      <span className={cn('font-medium', FIX_TONE[severityOf(props.connection)])}>{props.fix.problem}</span>{' '}
      <FixRemedy {...props} />
    </p>
  );
}

function FixRemedy({ connection, fix, onRotate, onLog }: FixProps) {
  const action = fix.action;
  const rotateLabel = connection.auth_kind === 'manual' ? 'Rotate webhook secret' : 'Rotate webhook secrets';
  return (
    <>
      {fix.remedy}
      {action ? ' ' : null}
      {action?.kind === 'external' ? (
        <a
          href={action.href}
          target="_blank"
          rel="noreferrer noopener"
          className="action-link inline-flex items-center gap-0.5 font-medium whitespace-nowrap"
        >
          {action.label}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      ) : action ? (
        <button
          type="button"
          onClick={action.kind === 'rotate' ? onRotate : onLog}
          className="action-link font-medium whitespace-nowrap"
        >
          {action.kind === 'rotate' ? rotateLabel : 'Delivery log'}
        </button>
      ) : null}
    </>
  );
}

const HEALTH_HUE: Record<Severity, Hue> = { stopped: 'red', at_risk: 'amber', healthy: 'gray' };

/** Healthy connections carry no chip: colour only where something is wrong. */
function HealthChip({ connection }: { connection: GitConnection }) {
  const level = severityOf(connection);
  if (level === 'healthy') return null;
  if (connection.health === 'active') return <HueChip hue="amber">Needs attention</HueChip>;
  const text =
    connection.health === 'expiring' && connection.token_expires_at
      ? `Expires ${formatDate(connection.token_expires_at)}`
      : HEALTH[connection.health].label;
  return <HueChip hue={HEALTH_HUE[level]}>{text}</HueChip>;
}

/** Each part keeps its separator on its own line, so a wrapped line never ends in a dangling dot. */
function Separated({ parts, className }: { parts: ReactNode[]; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-1.5', className)}>
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-x-1.5 whitespace-nowrap">
          {i > 0 ? (
            <span aria-hidden className="text-text-muted">
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </span>
  );
}

function webhookPart(connection: GitConnection): ReactNode {
  if (connection.repositories.webhooks_missing > 0) return null;
  if (connection.health !== 'active' && connection.health !== 'expiring') return null;
  return connection.auth_kind === 'app_installation' ? 'Delivered by the app' : 'Webhooks active';
}

function ConnectionRow({
  slug,
  connection,
  onOpen,
  onLog,
  onRotated,
}: {
  slug: string;
  connection: GitConnection;
  onOpen: () => void;
  onLog: () => void;
  onRotated: (connection: GitConnectionSecret) => void;
}) {
  const [confirm, setConfirm] = useState<MenuConfirm | null>(null);
  const { known, linked } = connection.repositories;
  const fix = fixFor(connection);
  const parts: ReactNode[] = [
    <span key="known" className="tabular">
      {count(known, 'repository', 'repositories')}
    </span>,
    <span key="linked" className="tabular">
      {linked} linked
    </span>,
    webhookPart(connection),
    connection.last_event_at ? (
      <span key="last">
        last delivery <RelativeTime value={connection.last_event_at} />
      </span>
    ) : (
      <span key="last">no delivery yet</span>
    ),
  ].filter(part => part !== null);
  if (connection.token_expires_at && connection.health !== 'expiring' && connection.health !== 'token_expired') {
    parts.push(
      <span key="token" title={formatDateTimeWithZone(connection.token_expires_at)}>
        token until {formatDate(connection.token_expires_at)}
      </span>,
    );
  }
  return (
    <li className="group/row relative flex items-start gap-3 px-3 py-3 hover:bg-hover">
      <ConnectionMark connection={connection} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 text-left font-medium [overflow-wrap:anywhere] group-hover/row:underline after:absolute after:inset-0 focus-visible:shadow-none focus-visible:after:shadow-(--focus-ring)"
          >
            {connection.account.login}
          </button>
          <span className="text-xs text-text-secondary">
            {providerLabel(connection.provider)} · {AUTH_KIND[connection.auth_kind]}
          </span>
          <HealthChip connection={connection} />
        </span>
        <Separated parts={parts} className="text-xs text-text-secondary" />
        {fix ? (
          <div className="relative z-10 self-start">
            <FixLine connection={connection} fix={fix} onRotate={() => setConfirm('rotate')} onLog={onLog} />
          </div>
        ) : null}
      </div>
      <div className="relative z-10 -my-1.5 flex-none">
        <ConnectionMenu
          slug={slug}
          connection={connection}
          onLog={onLog}
          onRotated={onRotated}
          confirm={confirm}
          onConfirmChange={setConfirm}
        />
      </div>
    </li>
  );
}

function ConnectionMark({ connection }: { connection: GitConnection }) {
  return connection.account.avatar_url ? (
    <MemberAvatar
      member={{ name: connection.account.login, avatar_url: connection.account.avatar_url }}
      className="mt-0.5 size-8 flex-none rounded-md"
    />
  ) : (
    <span className="grid size-5 flex-none place-items-center text-text-secondary">
      <ProviderGlyph provider={connection.provider} className="size-icon" />
    </span>
  );
}

type MenuConfirm = 'remove' | 'rotate';

function ConnectionMenu({
  slug,
  connection,
  onLog,
  onRotated,
  confirm,
  onConfirmChange: setConfirm,
}: {
  slug: string;
  connection: GitConnection;
  onLog: () => void;
  onRotated: (connection: GitConnectionSecret) => void;
  confirm: MenuConfirm | null;
  onConfirmChange: (confirm: MenuConfirm | null) => void;
}) {
  const refresh = useRefreshGitConnection(slug);
  const rotate = useRotateGitSecret(slug);
  const remove = useRemoveGitConnection(slug);
  const provider = providerLabel(connection.provider);
  const canRotate = connection.auth_kind !== 'app_installation';
  const manual = connection.auth_kind === 'manual';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${connection.account.login} actions`}
            className="text-text-secondary"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            disabled={refresh.isPending}
            onSelect={() =>
              refresh.mutate(connection.name, {
                onSuccess: () => toast.success(`${connection.account.login} was re-read from ${provider}.`),
                onError: error => toastError(`Could not re-sync ${connection.account.login}`, error),
              })
            }
          >
            <RefreshCw /> Re-sync now
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLog}>
            <ScrollText /> Delivery log
          </DropdownMenuItem>
          {canRotate ? (
            <DropdownMenuItem onSelect={() => setConfirm('rotate')}>
              <KeyRound /> {manual ? 'Rotate webhook secret' : 'Rotate webhook secrets'}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('remove')}>
            <Unlink /> Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={value => setConfirm(value ? 'remove' : null)}
        title={`Disconnect ${connection.account.login} on ${provider}?`}
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        pending={remove.isPending}
        onConfirm={() =>
          remove
            .mutateAsync(connection.name)
            .then(
              () => toast.success(`${connection.account.login} on ${provider} is disconnected.`),
              (error: Error) => toastError(`Could not disconnect ${connection.account.login}`, error),
            )
            .finally(() => setConfirm(null))
        }
      >
        <p>
          Its {count(connection.repositories.linked, 'linked repository', 'linked repositories')} stop feeding issues,
          and the automations they fire stop with them.
        </p>
        <p>
          What is already linked stays on each issue, read-only.
          {connection.auth_kind === 'app_installation'
            ? ` The app stays installed on ${provider}; uninstall it there if nothing else uses it.`
            : ' Remove the webhooks at the provider too.'}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'rotate'}
        onOpenChange={value => setConfirm(value ? 'rotate' : null)}
        title={manual ? 'Rotate the webhook secret?' : 'Rotate the webhook secrets?'}
        confirmLabel={manual ? 'Rotate webhook secret' : 'Rotate webhook secrets'}
        pendingLabel="Rotating…"
        destructive={false}
        pending={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(connection.name, {
            onSuccess: result => {
              setConfirm(null);
              if (result.auth_kind === 'manual' && result.webhook_secret) onRotated(result);
              else
                toast.success(
                  `Webhook secrets rotated at ${provider}. Open the connection to see any webhook it refused.`,
                );
            },
            onError: error => {
              setConfirm(null);
              toastError(
                manual ? 'Could not rotate the webhook secret' : 'Could not rotate the webhook secrets',
                error,
              );
            },
          })
        }
      >
        {manual ? (
          <>
            <p>
              The old secret stops working at once. Deliveries signed with it fail until each webhook has the new one.
            </p>
            <p>The new secret is shown once, on the next screen.</p>
          </>
        ) : (
          <p>
            Every webhook the server added to this connection’s repositories gets a new secret, at {provider}.
            Deliveries keep arriving; there is nothing for you to paste. A webhook {provider} refuses shows as failing
            in the connection’s repositories.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

function ProviderCard({
  slug,
  provider,
  blocked,
  onConnect,
}: {
  slug: string;
  provider: GitProviderInfo;
  blocked: boolean;
  onConnect: (target: ConnectTarget) => void;
}) {
  const start = useStartGitHubConnect(slug);
  const app = provider.connect_kind === 'app';
  const manual = provider.connect_kinds.includes('manual');
  const describedBy = blocked ? 'git-connection-limit' : undefined;

  const description =
    provider.kind === 'github'
      ? app
        ? 'Install the app on a GitHub organisation or account and choose the repositories it may read.'
        : 'The GitHub App isn’t set up on this server, so add a webhook to each repository. A token is optional.'
      : 'A group or project access token. Works with gitlab.com and with a self-managed GitLab at its own address.';

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center gap-2 font-medium">
        <ProviderGlyph provider={provider.kind} className="size-icon" />
        {provider.label}
      </div>
      <p className="text-sm text-pretty text-text-secondary">{description}</p>
      {start.isError ? <p className="text-xs text-danger-fg">{start.error.message}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {app ? (
          <PendingButton
            size="sm"
            variant="outline"
            disabled={blocked}
            aria-describedby={describedBy}
            onClick={() =>
              start.mutate(undefined, { onSuccess: ({ install_url }) => window.location.assign(install_url) })
            }
            pending={start.isPending}
            pendingLabel="Opening GitHub…"
          >
            Connect GitHub
          </PendingButton>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={blocked}
            aria-describedby={describedBy}
            onClick={() => onConnect({ provider, mode: provider.connect_kind === 'token' ? 'token' : 'manual' })}
          >
            Connect {provider.label}
          </Button>
        )}
        {app && manual ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-text-secondary"
            disabled={blocked}
            onClick={() => onConnect({ provider, mode: 'manual' })}
          >
            Use a webhook instead
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ProvidersSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading providers">
      <ProviderCardSkeleton />
      <ProviderCardSkeleton />
    </div>
  );
}

function ProviderCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4" aria-hidden>
      <div className="flex h-5 items-center gap-2">
        <Skeleton className="size-icon rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex h-10 flex-col justify-center gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

function ConnectionDetail({
  slug,
  connection,
  onBack,
  onLog,
  onRotated,
}: {
  slug: string;
  connection: GitConnection;
  onBack: () => void;
  onLog: (repository: string | null) => void;
  onRotated: (connection: GitConnectionSecret) => void;
}) {
  const [confirm, setConfirm] = useState<MenuConfirm | null>(null);
  const fix = fixFor(connection);
  const level = severityOf(connection);
  const meta: ReactNode[] = [providerLabel(connection.provider), AUTH_KIND[connection.auth_kind], connection.base_url];
  if (connection.created_by) {
    meta.push(
      <span key="by">
        connected by <PersonName person={connection.created_by} /> <RelativeTime value={connection.created_at} />
      </span>,
    );
  }
  return (
    <>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 self-start text-text-secondary" onClick={onBack}>
          <ArrowLeft /> All connections
        </Button>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 max-sm:grid-cols-[auto_minmax(0,1fr)]">
          <span className="grid h-7 place-items-center">
            <ConnectionMark connection={connection} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={connection.account.url}
                target="_blank"
                rel="noreferrer noopener"
                className="min-w-0 text-md leading-7 font-semibold [overflow-wrap:anywhere] hover:underline"
              >
                {connection.account.login}
              </a>
              <HealthChip connection={connection} />
            </div>
            <Separated parts={meta} className="text-xs text-text-secondary" />
            {connection.auth_kind === 'manual' && !connection.has_token ? (
              <p className="text-xs text-text-secondary">
                No token: pull request commits and recent history are not read. Inherited links and backfill are off.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 max-sm:col-span-2 max-sm:col-start-1">
            <Button variant="outline" size="sm" onClick={() => onLog(null)}>
              <ScrollText /> Delivery log
            </Button>
            <ConnectionMenu
              slug={slug}
              connection={connection}
              onLog={() => onLog(null)}
              onRotated={onRotated}
              confirm={confirm}
              onConfirmChange={setConfirm}
            />
          </div>
          {connection.webhook_url ? (
            <div className="col-start-2 max-sm:col-span-2 max-sm:col-start-1">
              <PayloadUrl url={connection.webhook_url} />
            </div>
          ) : null}
        </div>
        {fix ? (
          <FormAlert tone={level === 'stopped' ? 'danger' : 'warning'} title={fix.problem}>
            <FixRemedy
              connection={connection}
              fix={fix}
              onRotate={() => setConfirm('rotate')}
              onLog={() => onLog(null)}
            />
          </FormAlert>
        ) : null}
      </div>
      <SettingsSection
        title="Repositories"
        description="Everything this connection can see. Link a repository to a project and its branches, commits and pull requests start feeding that project’s issues."
      >
        <ConnectionRepositories slug={slug} connection={connection} onDeliveries={repository => onLog(repository)} />
      </SettingsSection>
    </>
  );
}

function PayloadUrl({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-none text-text-secondary">Payload URL</span>
      <code
        title={url}
        className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-sm border bg-inset px-2 font-mono whitespace-nowrap text-text"
      >
        {url}
      </code>
      <span className="flex-none">
        <CopyButton value={url} what="Payload URL" />
      </span>
    </div>
  );
}

const IDENTITY_COLUMNS = ['w-[28%]', 'w-[28%]', 'w-[20%]', 'w-[14%]', 'w-[10%]'] as const;

function MemberIdentities({ slug, identities }: { slug: string; identities: UseQueryResult<MemberGitIdentity[]> }) {
  const remove = useRemoveMemberGitIdentity(slug);
  const [removing, setRemoving] = useState<MemberGitIdentity | null>(null);
  const rows = identities.data ?? [];

  return (
    <SettingsSection title="Members’ git identities" description={IDENTITIES_DESCRIPTION}>
      {identities.isPending ? (
        <IdentitiesSkeleton />
      ) : identities.isError && !identities.data ? (
        <LoadError onRetry={() => void identities.refetch()} detail={errorDetail(identities.error)}>
          The identities could not be loaded.
        </LoadError>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No member has added a git identity yet."
          description="Each person adds their own in Account settings → Git identities."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <thead className="bg-app text-left text-2xs text-text-secondary">
              <tr>
                <th className={cn('h-7 px-3 font-medium', IDENTITY_COLUMNS[0])}>Member</th>
                <th className={cn('px-3 font-medium', IDENTITY_COLUMNS[1])}>Identity</th>
                <th className={cn('px-3 font-medium', IDENTITY_COLUMNS[2])}>Source</th>
                <th className={cn('px-3 font-medium', IDENTITY_COLUMNS[3])}>Added</th>
                <th className={cn('px-3', IDENTITY_COLUMNS[4])} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(identity => (
                <tr key={identity.id} className="h-row">
                  <td className="px-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <MemberAvatar member={identity.member} />
                      <PersonName person={identity.member} />
                    </span>
                  </td>
                  <td className="px-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ProviderGlyph provider={identity.provider} className="flex-none text-text-muted" />
                      <span
                        className="truncate font-mono text-xs"
                        title={identity.login ? `@${identity.login}` : (identity.email ?? undefined)}
                      >
                        {identity.login ? `@${identity.login}` : identity.email}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 text-xs text-text-secondary">{VERIFIED_BY[identity.verified_by]}</td>
                  <td className="px-3">
                    <RelativeTime value={identity.created_at} className="text-xs whitespace-nowrap" />
                  </td>
                  <td className="px-3 text-right">
                    {identity.verified_by === 'claim' ? (
                      <Button variant="outline" size="xs" onClick={() => setRemoving(identity)}>
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => (open ? null : setRemoving(null))}
        title={removing ? `Remove @${removing.login} from ${removing.member.name}?` : ''}
        confirmLabel="Remove identity"
        pendingLabel="Removing…"
        pending={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: error => {
              setRemoving(null);
              toastError('Could not remove the identity', error);
            },
          })
        }
      >
        <p>
          The login goes for {removing?.member.name} everywhere, not only in this organisation: identities belong to the
          account.
        </p>
      </ConfirmDialog>
    </SettingsSection>
  );
}

function IdentitiesSkeleton() {
  return (
    <div className="overflow-x-auto" role="status" aria-label="Loading identities">
      <TableSkeleton
        className="min-w-[640px]"
        rows={3}
        rowClassName="h-row"
        columns={IDENTITY_COLUMNS.map(className => ({ className }))}
      />
    </div>
  );
}

const VERIFIED_BY = { provider: 'Matched by the provider', email: 'Verified email', claim: 'Claimed login' } as const;

function ConnectionsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton className="size-5 rounded-sm" />
          <div className="flex flex-1 flex-col gap-2 py-0.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
