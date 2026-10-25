'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { ArrowLeft, ChevronRight, KeyRound, MoreHorizontal, RefreshCw, ScrollText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  GitConnection,
  GitConnectionSecret,
  GitProviderInfo,
  MemberGitIdentity,
  Organization,
} from '@nothingleft/types';
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
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { RelativeTime } from '@components/relative-time';
import { PersonName } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { SettingsSection } from '@components/settings/section';
import { HueChip } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
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

const AUTH_KIND = { app_installation: 'App installation', token: 'Access token', manual: 'Webhook by hand' } as const;

export function IntegrationsTab({ organization }: { organization: Organization }) {
  const slug = organization.slug;
  const router = useRouter();
  const params = useSearchParams();
  const providers = useGitProviders();
  const connections = useGitConnections(slug);
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
  const open = live.find(c => c.name === params.get('connection')) ?? null;
  const logConnection = log ? (list.find(c => c.name === log.connection) ?? null) : null;
  const attention = live.filter(c => c.health !== 'active');

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

  return (
    <>
      {attention.map(c => (
        <FormAlert
          key={c.name}
          tone={c.health === 'expiring' ? 'warning' : 'danger'}
          title={`${c.account.login} on ${providerLabel(c.provider)} needs attention.`}
        >
          {attentionSentence(c)}{' '}
          <button type="button" onClick={() => setParams({ connection: c.name })}>
            Open the connection
          </button>
        </FormAlert>
      ))}

      <SettingsSection
        title="Connected accounts"
        description="GitHub and GitLab accounts whose repositories can feed issues. A connection only reads: it never comments, sets statuses or pushes."
      >
        {connections.isPending ? (
          <ConnectionsSkeleton />
        ) : connections.isError && !connections.data ? (
          <FormAlert title="The connections could not be loaded.">
            <button type="button" onClick={() => void connections.refetch()}>
              Try again
            </button>
          </FormAlert>
        ) : live.length === 0 ? (
          <EmptyState
            title="No account is connected yet."
            description="Connect one below. Then link its repositories to projects in each project’s settings."
          />
        ) : (
          <ul className="divide-y divide-border-subtle rounded-md border">
            {live.map(connection => (
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

      <SettingsSection
        title="Connect an account"
        description="Several accounts are fine: two GitHub organisations and a GitLab group, say. The free plan connects 2."
      >
        {providers.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : providers.isError ? (
          <FormAlert title="The providers could not be loaded.">
            <button type="button" onClick={() => void providers.refetch()}>
              Try again
            </button>
          </FormAlert>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.data.map(provider => (
              <ProviderCard key={provider.kind} slug={slug} provider={provider} onConnect={setConnecting} />
            ))}
          </div>
        )}
      </SettingsSection>

      <MemberIdentities slug={slug} />

      {dialogs}
    </>
  );
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

function HealthChip({ connection }: { connection: GitConnection }) {
  const { label, hue } = HEALTH[connection.health];
  const text =
    connection.health === 'expiring' && connection.token_expires_at
      ? `Expires ${formatDate(connection.token_expires_at)}`
      : label;
  return <HueChip hue={hue}>{text}</HueChip>;
}

function webhookLine(connection: GitConnection): { text: string; warn: boolean } {
  const { webhooks_missing } = connection.repositories;
  if (webhooks_missing > 0) {
    return { text: `Webhook missing on ${count(webhooks_missing, 'repository', 'repositories')}`, warn: true };
  }
  return {
    text: connection.auth_kind === 'app_installation' ? 'Delivered by the app' : 'Webhooks active',
    warn: false,
  };
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
  const webhook = webhookLine(connection);
  const { known, linked } = connection.repositories;
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left group/row">
        <ConnectionMark connection={connection} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium group-hover/row:underline">{connection.account.login}</span>
            <span className="text-xs text-text-secondary">
              {providerLabel(connection.provider)} · {AUTH_KIND[connection.auth_kind]}
            </span>
            <HealthChip connection={connection} />
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
            <span className="tabular">
              {known} known · {linked} linked
            </span>
            <span aria-hidden>·</span>
            <span className={cn(webhook.warn && 'font-medium text-warning-fg')}>{webhook.text}</span>
            <span aria-hidden>·</span>
            {connection.last_event_at ? (
              <span>
                last delivery <RelativeTime value={connection.last_event_at} />
              </span>
            ) : (
              <span className="text-text-muted">no delivery yet</span>
            )}
            {connection.token_expires_at && connection.health !== 'expiring' ? (
              <>
                <span aria-hidden>·</span>
                <span title={formatDateTimeWithZone(connection.token_expires_at)}>
                  token until {formatDate(connection.token_expires_at)}
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>
      <ConnectionMenu slug={slug} connection={connection} onLog={onLog} onRotated={onRotated} />
      <ChevronRight aria-hidden className="size-icon-sm text-text-muted" />
    </li>
  );
}

function ConnectionMark({ connection }: { connection: GitConnection }) {
  return (
    <span className="relative mt-0.5 flex-none">
      {connection.account.avatar_url ? (
        <MemberAvatar
          member={{ name: connection.account.login, avatar_url: connection.account.avatar_url }}
          className="size-8 rounded-md"
        />
      ) : (
        <span className="grid size-8 place-items-center rounded-md border bg-inset text-text-secondary">
          <ProviderGlyph provider={connection.provider} className="size-icon" />
        </span>
      )}
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${connection.account.login} actions`}
            className="text-text-muted"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            disabled={refresh.isPending}
            onSelect={() =>
              refresh.mutate(connection.name, {
                onSuccess: () => toast.success(`${connection.account.login} was checked again with ${provider}.`),
                onError: error => toast.error(error.message),
              })
            }
          >
            <RefreshCw /> Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLog}>
            <ScrollText /> Delivery log
          </DropdownMenuItem>
          {canRotate ? (
            <DropdownMenuItem onSelect={() => setConfirm('rotate')}>
              <KeyRound /> {connection.auth_kind === 'manual' ? 'Rotate secret' : 'Replace hook tokens'}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('remove')}>
            <Trash2 /> Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={value => setConfirm(value ? 'remove' : null)}
        title={`Disconnect ${connection.account.login} on ${provider}?`}
        confirmLabel="Disconnect"
        pending={remove.isPending}
        onConfirm={() =>
          remove
            .mutateAsync(connection.name)
            .then(
              () => toast.success(`${connection.account.login} on ${provider} is disconnected.`),
              (error: Error) => toast.error(error.message),
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
        title={connection.auth_kind === 'manual' ? 'Rotate the webhook secret?' : 'Replace the hook tokens?'}
        confirmLabel={connection.auth_kind === 'manual' ? 'Rotate secret' : 'Replace tokens'}
        destructive={false}
        pending={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(connection.name, {
            onSuccess: result => {
              setConfirm(null);
              if (result.auth_kind === 'manual' && result.webhook_secret) onRotated(result);
              else toast.success('Hook tokens replaced on every repository this connection registered a webhook on.');
            },
            onError: error => {
              setConfirm(null);
              toast.error(error.message);
            },
          })
        }
      >
        {connection.auth_kind === 'manual' ? (
          <>
            <p>
              The old secret stops working at once. Deliveries signed with it fail until each webhook has the new one.
            </p>
            <p>The new secret is shown once, on the next screen.</p>
          </>
        ) : (
          <p>
            The server replaces the token on every webhook it registered for this connection. Nothing needs changing at{' '}
            {provider}.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

function ProviderCard({
  slug,
  provider,
  onConnect,
}: {
  slug: string;
  provider: GitProviderInfo;
  onConnect: (target: ConnectTarget) => void;
}) {
  const start = useStartGitHubConnect(slug);
  const app = provider.connect_kind === 'app';
  const manual = provider.connect_kinds.includes('manual');

  const description =
    provider.kind === 'github'
      ? app
        ? 'Install the app on a GitHub organisation or account and choose the repositories it may read.'
        : 'This server has no GitHub App, so you add a webhook to each repository yourself, with an optional token.'
      : `A group or project access token. Works with gitlab.com and with a self-managed GitLab at its own address.`;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center gap-2 font-medium">
        <ProviderGlyph provider={provider.kind} className="size-icon" />
        {provider.label}
      </div>
      <p className="text-xs text-text-secondary">{description}</p>
      {start.isError ? <p className="text-xs text-danger-fg">{start.error.message}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {app ? (
          <Button
            size="sm"
            disabled={start.isPending}
            onClick={() =>
              start.mutate(undefined, { onSuccess: ({ install_url }) => window.location.assign(install_url) })
            }
          >
            {start.isPending ? 'Opening GitHub…' : 'Connect GitHub'}
          </Button>
        ) : (
          <Button
            size="sm"
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
            onClick={() => onConnect({ provider, mode: 'manual' })}
          >
            Use a webhook instead
          </Button>
        ) : null}
      </div>
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
  return (
    <>
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 self-start text-text-secondary" onClick={onBack}>
          <ArrowLeft /> All connections
        </Button>
        <div className="flex items-start gap-3">
          <ConnectionMark connection={connection} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={connection.account.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-md font-semibold hover:underline"
              >
                {connection.account.login}
              </a>
              <HealthChip connection={connection} />
            </div>
            <p className="text-xs text-text-secondary">
              {providerLabel(connection.provider)} · {AUTH_KIND[connection.auth_kind]} · {connection.base_url}
              {connection.created_by ? (
                <>
                  {' '}
                  · connected by <PersonName person={connection.created_by} />{' '}
                  <RelativeTime value={connection.created_at} />
                </>
              ) : null}
            </p>
            {connection.auth_kind === 'manual' && !connection.has_token ? (
              <p className="text-xs text-text-secondary">
                No token: pull request commits and recent history are not read. Inherited links and backfill are off.
              </p>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={() => onLog(null)}>
            <ScrollText /> Delivery log
          </Button>
          <ConnectionMenu slug={slug} connection={connection} onLog={() => onLog(null)} onRotated={onRotated} />
        </div>
        {reason ? (
          <FormAlert
            tone={connection.health === 'expiring' ? 'warning' : 'danger'}
            title="This connection needs attention."
          >
            {reason}
          </FormAlert>
        ) : null}
        {connection.webhook_url ? (
          <p className="text-xs text-text-secondary">
            Payload URL <code className="rounded-xs bg-inset px-1 font-mono text-text">{connection.webhook_url}</code>
          </p>
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

function MemberIdentities({ slug }: { slug: string }) {
  const identities = useMemberGitIdentities(slug);
  const remove = useRemoveMemberGitIdentity(slug);
  const [removing, setRemoving] = useState<MemberGitIdentity | null>(null);
  const rows = identities.data ?? [];

  return (
    <SettingsSection
      title="Members’ git identities"
      description="Logins and verified emails members have added, so commits and pull requests show under their name. Attribution only, never sign-in."
    >
      {identities.isPending ? (
        <ConnectionsSkeleton rows={2} />
      ) : identities.isError && !identities.data ? (
        <FormAlert title="The identities could not be loaded.">
          <button type="button" onClick={() => void identities.refetch()}>
            Try again
          </button>
        </FormAlert>
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
                <th className="h-7 w-52 px-3 font-medium">Member</th>
                <th className="px-3 font-medium">Identity</th>
                <th className="w-48 px-3 font-medium">How it counts</th>
                <th className="w-28 px-3 font-medium">Added</th>
                <th className="w-24 px-3" aria-label="Actions" />
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
                      <ProviderGlyph provider={identity.provider} className="text-text-muted" />
                      <span className="truncate font-mono text-xs">
                        {identity.login ? `@${identity.login}` : identity.email}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 text-xs text-text-secondary">{VERIFIED_BY[identity.verified_by]}</td>
                  <td className="px-3">
                    <RelativeTime value={identity.created_at} className="text-xs" />
                  </td>
                  <td className="px-3 text-right">
                    {identity.verified_by === 'claim' ? (
                      <Button variant="ghost" size="xs" onClick={() => setRemoving(identity)}>
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
        pending={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: error => {
              setRemoving(null);
              toast.error(error.message);
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

const VERIFIED_BY = { provider: 'Matched by the provider', email: 'Verified email', claim: 'Claimed login' } as const;

function ConnectionsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-avatar rounded-sm" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}
