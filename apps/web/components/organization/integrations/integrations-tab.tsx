'use client';

import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { ArrowLeft, ChevronRight, KeyRound, MoreHorizontal, RefreshCw, ScrollText, Unlink } from 'lucide-react';
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
import { CONNECTION_REASON, HEALTH, count, providerLabel } from '@lib/git/words';
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
  const nothingLoaded = failed(connections) && failed(providers) && failed(identities);

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
      : `Connect as many accounts as your plan allows (${planLabel}: ${limit}).`;

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

  if (nothingLoaded) {
    return (
      <LoadError
        onRetry={() => {
          void connections.refetch();
          void providers.refetch();
          void identities.refetch();
        }}
        detail={errorDetail(connections.error)}
      >
        The integrations could not be loaded.
      </LoadError>
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
          <p id="git-connection-limit" className="rounded-md border bg-app px-3 py-2.5 text-sm text-text-secondary">
            {live.length > limit
              ? `${live.length} connections in use; ${planLabel} allows ${limit}.`
              : `${live.length} of ${limit} connections used on ${planLabel}.`}{' '}
            Disconnect one to connect another, or{' '}
            <Link href={PLAN_TAB} className="action-link text-text">
              see the plan
            </Link>
            .
          </p>
        ) : null}
        {providers.isPending ? (
          <ProvidersSkeleton />
        ) : failed(providers) || !providers.data ? (
          <LoadError onRetry={() => void providers.refetch()} detail={errorDetail(providers.error)}>
            The providers could not be loaded.
          </LoadError>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.data.map((provider, i) => (
              <ProviderCard
                key={provider.kind}
                slug={slug}
                provider={provider}
                primary={live.length === 0 && i === 0}
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

function severity(connection: GitConnection): number {
  if (connection.health === 'active') return connection.repositories.webhooks_missing > 0 ? 1 : 0;
  return HEALTH[connection.health].hue === 'red' ? 3 : 2;
}

function AttentionSummary({ connections }: { connections: GitConnection[] }) {
  const stopped = connections.filter(c => c.health !== 'active' && c.health !== 'expiring');
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

function rowReason(connection: GitConnection): string | null {
  if (connection.health === 'active') return null;
  if (connection.health === 'expiring') return 'Replace the token before it expires, or new activity stops arriving.';
  if (connection.health === 'removed_at_provider') return 'Removed at the provider. Nothing new arrives.';
  const reason = connection.last_error ? CONNECTION_REASON[connection.last_error] : null;
  return reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : 'New activity may not be arriving.';
}

function attentionSentence(connection: GitConnection): string {
  if (connection.health === 'expiring' && connection.token_expires_at) {
    return `Its access token expires ${formatDate(connection.token_expires_at)}. Replace it before then, or new activity stops arriving.`;
  }
  if (connection.health === 'removed_at_provider')
    return 'It was removed at the provider. What is linked stays; nothing new arrives.';
  const reason = connection.last_error ? CONNECTION_REASON[connection.last_error] : null;
  return reason
    ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. What is linked stays; new activity stops arriving until it is fixed.`
    : 'New activity may not be arriving.';
}

/** Healthy connections carry no chip: colour only where something is wrong. */
function HealthChip({ connection }: { connection: GitConnection }) {
  if (connection.health === 'active') {
    return connection.repositories.webhooks_missing > 0 ? <HueChip hue="amber">Needs attention</HueChip> : null;
  }
  const { label, hue } = HEALTH[connection.health];
  const text =
    connection.health === 'expiring' && connection.token_expires_at
      ? `Expires ${formatDate(connection.token_expires_at)}`
      : label;
  return <HueChip hue={hue}>{text}</HueChip>;
}

function Separated({ parts, className }: { parts: ReactNode[]; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-1.5', className)}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden className="text-text-muted">
              ·
            </span>
          ) : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function webhookPart(connection: GitConnection): ReactNode {
  const { webhooks_missing } = connection.repositories;
  if (webhooks_missing > 0) {
    return (
      <span className="font-medium text-warning-fg">
        Webhook missing on {count(webhooks_missing, 'repository', 'repositories')}
      </span>
    );
  }
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
  const { known, linked } = connection.repositories;
  const reason = rowReason(connection);
  const parts: ReactNode[] = [
    <span key="known" className="tabular">
      {known} known
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
  ];
  if (connection.token_expires_at && connection.health !== 'expiring') {
    parts.push(
      <span key="token" title={formatDateTimeWithZone(connection.token_expires_at)}>
        token until {formatDate(connection.token_expires_at)}
      </span>,
    );
  }
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <button type="button" onClick={onOpen} className="group/row flex min-w-0 flex-1 items-start gap-3 text-left">
        <ConnectionMark connection={connection} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 font-medium [overflow-wrap:anywhere] group-hover/row:underline">
              {connection.account.login}
            </span>
            <span className="text-xs text-text-secondary">
              {providerLabel(connection.provider)} · {AUTH_KIND[connection.auth_kind]}
            </span>
            <HealthChip connection={connection} />
          </span>
          <Separated parts={parts} className="text-xs text-text-secondary" />
          {reason ? (
            <span className={cn('text-xs', connection.health === 'expiring' ? 'text-warning-fg' : 'text-danger-fg')}>
              {reason}
            </span>
          ) : null}
        </span>
      </button>
      <ConnectionMenu slug={slug} connection={connection} onLog={onLog} onRotated={onRotated} />
      <ChevronRight aria-hidden className="size-icon-sm text-text-muted" />
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

function ConnectionMenu({
  slug,
  connection,
  onLog,
  onRotated,
}: {
  slug: string;
  connection: GitConnection;
  onLog: () => void;
  onRotated: (connection: GitConnectionSecret) => void;
}) {
  const [confirm, setConfirm] = useState<'remove' | 'rotate' | null>(null);
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
              <KeyRound /> {manual ? 'Rotate secret' : 'Replace webhook secrets'}
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
        title={manual ? 'Rotate the webhook secret?' : 'Replace the webhook secrets?'}
        confirmLabel={manual ? 'Rotate secret' : 'Replace secrets'}
        pendingLabel={manual ? 'Rotating…' : 'Replacing…'}
        destructive={false}
        pending={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(connection.name, {
            onSuccess: result => {
              setConfirm(null);
              if (result.auth_kind === 'manual' && result.webhook_secret) onRotated(result);
              else
                toast.success(
                  `Webhook secrets replaced at ${provider}. Open the connection to see any webhook it refused.`,
                );
            },
            onError: error => {
              setConfirm(null);
              toastError(manual ? 'Could not rotate the secret' : 'Could not replace the webhook secrets', error);
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
  primary,
  blocked,
  onConnect,
}: {
  slug: string;
  provider: GitProviderInfo;
  primary: boolean;
  blocked: boolean;
  onConnect: (target: ConnectTarget) => void;
}) {
  const start = useStartGitHubConnect(slug);
  const app = provider.connect_kind === 'app';
  const manual = provider.connect_kinds.includes('manual');
  const variant = primary && !blocked ? 'default' : 'outline';
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
            variant={variant}
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
            variant={variant}
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
  const reason = connection.health === 'active' ? null : attentionSentence(connection);
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
          <div className="flex items-center gap-1 max-sm:col-start-2">
            <Button variant="outline" size="sm" onClick={() => onLog(null)}>
              <ScrollText /> Delivery log
            </Button>
            <ConnectionMenu slug={slug} connection={connection} onLog={() => onLog(null)} onRotated={onRotated} />
          </div>
        </div>
        {reason ? (
          <FormAlert
            tone={connection.health === 'expiring' ? 'warning' : 'danger'}
            title="This connection needs attention."
          >
            {reason}
          </FormAlert>
        ) : null}
        {connection.webhook_url ? <PayloadUrl url={connection.webhook_url} /> : null}
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
    <div className="flex items-start gap-2 text-xs max-sm:flex-col max-sm:items-stretch">
      <span className="flex-none leading-8 text-text-secondary max-sm:leading-5">Payload URL</span>
      <code className="min-w-0 self-center rounded-xs bg-inset px-1.5 py-1 font-mono [overflow-wrap:anywhere] text-text max-sm:self-stretch">
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
                <th className={cn('px-3 font-medium', IDENTITY_COLUMNS[2])}>How it counts</th>
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
