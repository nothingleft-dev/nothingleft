'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Copy, Lock, MoreHorizontal, Plus, RefreshCw, ScrollText, Search, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import type { GitConnection, GitRepository, GitWebhookStatus } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { TableSkeleton } from '@components/skeletons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { HueDot } from '@components/git/git-marks';
import {
  GIT_PAGE,
  useGitRepositories,
  useRefreshGitConnection,
  useLinkRepositoryTo,
  useRehookGitRepository,
  useResyncGitRepository,
} from '@hooks/use-git';
import { useDebounced } from '@hooks/use-debounced';
import { ProjectMark } from '@components/projects/project-mark';
import { PendingButton } from '@components/pending-button';
import { providerLabel } from '@lib/git/words';
import { useProjects } from '@hooks/use-projects';
import type { Hue } from '@lib/git/words';
import { formatCount } from '@lib/numbers';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';

// Healthy is the resting state: a hollow dot in neutral ink. Only a problem wears colour.
const WEBHOOK: Record<GitWebhookStatus, { label: string; hue: Hue }> = {
  active: { label: 'Active', hue: 'gray' },
  failing: { label: 'Failing', hue: 'red' },
  missing: { label: 'Missing', hue: 'amber' },
  not_applicable: { label: 'Via the app', hue: 'gray' },
};

const COLUMNS = ['', 'w-44', 'w-36', 'w-32', 'w-12'] as const;

export function ConnectionRepositories({
  slug,
  connection,
  onDeliveries,
}: {
  slug: string;
  connection: GitConnection;
  onDeliveries: (repository: string) => void;
}) {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const query = useDebounced(q.trim(), 300);
  const repositories = useGitRepositories(slug, {
    connection: connection.name,
    ...(query ? { q: query } : {}),
    offset,
  });
  const refresh = useRefreshGitConnection(slug);
  const rows = repositories.data?.data ?? [];
  const total = repositories.data?.meta.pagination?.total ?? rows.length;
  const nothingToSearch = !q && !query && repositories.data !== undefined && total === 0;
  const provider = providerLabel(connection.provider);
  const viaApp = connection.auth_kind === 'app_installation';

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('relative max-w-xs max-sm:max-w-none', nothingToSearch && 'hidden')}>
        <Search aria-hidden className="absolute top-1/2 left-2.5 size-icon-sm -translate-y-1/2 text-text-muted" />
        <Input
          value={q}
          onChange={event => {
            setQ(event.target.value);
            setOffset(0);
          }}
          placeholder="Search repositories"
          aria-label="Search repositories"
          className="pl-8"
        />
      </div>

      {repositories.isPending ? (
        <RepositoriesSkeleton />
      ) : repositories.isError && !repositories.data ? (
        <LoadError onRetry={() => void repositories.refetch()} detail={errorDetail(repositories.error)}>
          The repositories could not be loaded.
        </LoadError>
      ) : rows.length === 0 && query ? (
        <EmptyState
          title={`No repository matches “${query}”.`}
          description="Clear the search to see every repository."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="This connection sees no repositories yet."
          description={
            connection.auth_kind === 'manual'
              ? connection.has_token
                ? 'A repository appears once its first webhook delivery arrives, or when you re-sync.'
                : 'A repository appears once its first webhook delivery arrives. Add the webhook with the payload URL above.'
              : 'Re-sync asks the provider again; check which repositories the installation or token may read.'
          }
          action={
            <div className="flex flex-wrap gap-2">
              {connection.webhook_url ? <CopyUrlButton url={connection.webhook_url} /> : null}
              {connection.auth_kind !== 'manual' || connection.has_token ? (
                <PendingButton
                  variant="outline"
                  size="sm"
                  pending={refresh.isPending}
                  pendingLabel="Re-syncing…"
                  onClick={() =>
                    refresh.mutate(connection.name, {
                      onSuccess: () => toast.success(`${connection.account.login} was re-read from ${provider}.`),
                      onError: error => toastError(`Could not re-sync ${connection.account.login}`, error),
                    })
                  }
                >
                  <RefreshCw /> Re-sync now
                </PendingButton>
              ) : null}
            </div>
          }
        />
      ) : (
        <>
          {viaApp ? (
            <p className="text-xs text-text-secondary">
              Deliveries come through the {provider} app, so no repository needs a webhook of its own.
            </p>
          ) : null}
          <div className="rounded-md border sm:overflow-x-auto">
            <table className="w-full table-fixed text-sm max-sm:block sm:min-w-[720px]">
              <thead className="bg-app text-left text-2xs text-text-secondary max-sm:hidden">
                <tr>
                  <th className="h-7 px-3 font-medium">Repository</th>
                  <th className={cn('px-3 font-medium', COLUMNS[1])}>Linked to</th>
                  {viaApp ? null : <th className={cn('px-3 font-medium', COLUMNS[2])}>Webhook</th>}
                  <th className={cn('px-3 font-medium', COLUMNS[3])}>Last event</th>
                  <th className={cn('px-3', COLUMNS[4])} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle max-sm:block">
                {rows.map(repository => (
                  <RepositoryRow
                    key={repository.full_name}
                    slug={slug}
                    repository={repository}
                    showWebhook={!viaApp}
                    onDeliveries={() => onDeliveries(repository.full_name)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {total > GIT_PAGE ? (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          {formatCount(offset + 1)}–{formatCount(Math.min(offset + GIT_PAGE, total))} of {formatCount(total)}
          <Button
            variant="outline"
            size="xs"
            className="ml-auto"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - GIT_PAGE))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={offset + GIT_PAGE >= total}
            onClick={() => setOffset(offset + GIT_PAGE)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const NONE = (
  <span className="text-xs text-text-muted" title="None">
    –
  </span>
);

function RepositoryRow({
  slug,
  repository,
  showWebhook,
  onDeliveries,
}: {
  slug: string;
  repository: GitRepository;
  showWebhook: boolean;
  onDeliveries: () => void;
}) {
  const resync = useResyncGitRepository(slug);
  const rehook = useRehookGitRepository(slug);
  const webhook = WEBHOOK[repository.webhook_status];
  const dim = repository.removed || repository.is_archived;

  return (
    <tr
      className={cn(
        'group/repo h-11 align-middle',
        'max-sm:grid max-sm:h-auto max-sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1 max-sm:py-2 max-sm:pr-1 max-sm:pl-3 max-sm:[&>td]:px-0',
        dim && 'text-text-muted',
      )}
    >
      <td className="px-3 max-sm:col-span-3">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={repository.html_url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn('truncate font-mono text-xs hover:underline', dim ? 'text-text-muted' : 'text-text')}
          >
            {repository.full_name}
          </a>
          {repository.is_private ? <Lock aria-label="Private" className="size-3 flex-none text-text-muted" /> : null}
          {repository.removed ? (
            <span className="flex-none text-2xs">removed at the provider</span>
          ) : repository.is_archived ? (
            <span className="flex-none text-2xs">archived</span>
          ) : null}
        </div>
      </td>
      <td className="px-3">
        {repository.projects.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            {repository.projects.map(key => (
              <Link
                key={key}
                href={`/projects/${key}/settings?tab=repositories` as Route}
                aria-label={`${key} repository settings`}
                className="inline-flex h-5 items-center rounded-sm border px-1 font-mono text-2xs leading-4 text-text-secondary hover:border-border-strong hover:text-text"
              >
                {key}
              </Link>
            ))}
            {repository.match_all_projects ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 cursor-help items-center rounded-sm border px-1 text-2xs leading-4 text-text-secondary">
                    All projects
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  Its commits and pull requests can name an issue in any project
                </TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        ) : dim ? (
          NONE
        ) : (
          <LinkToProject repository={repository} />
        )}
      </td>
      {showWebhook ? (
        <td className="px-3">
          {repository.projects.length === 0 && repository.webhook_status === 'missing' ? (
            <span className="text-xs text-text-muted" title="Not needed until the repository is linked">
              –
            </span>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs',
                webhook.hue === 'red'
                  ? 'text-danger-fg'
                  : webhook.hue === 'amber'
                    ? 'text-warning-fg'
                    : 'text-text-secondary',
              )}
            >
              <HueDot hue={webhook.hue} />
              {webhook.label}
              {repository.webhook_last_status_code !== null ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help font-mono text-2xs text-text-muted">
                      {repository.webhook_last_status_code}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    The provider’s HTTP status on its last delivery
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </span>
          )}
        </td>
      ) : null}
      <td className="px-3">
        {repository.last_event_at ? (
          <RelativeTime value={repository.last_event_at} className="text-xs whitespace-nowrap" />
        ) : (
          <span className="text-xs text-text-muted" title="Nothing has arrived from this repository yet">
            –
          </span>
        )}
      </td>
      <td className="px-3 text-right max-sm:col-start-4 max-sm:row-span-2 max-sm:row-start-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`${repository.full_name} actions`}
              className="text-text-muted"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuItem
              disabled={repository.removed || resync.isPending}
              onSelect={() =>
                resync.mutate(
                  { repository: repository.full_name, connection: repository.connection },
                  {
                    onSuccess: () => toast.success(`${repository.full_name} is being re-read from the provider.`),
                    onError: error => toastError(`Could not re-read ${repository.full_name}`, error),
                  },
                )
              }
            >
              <RefreshCw /> Re-sync now
            </DropdownMenuItem>
            {repository.webhook_status === 'missing' || repository.webhook_status === 'failing' ? (
              <DropdownMenuItem
                disabled={rehook.isPending}
                onSelect={() =>
                  rehook.mutate(
                    { repository: repository.full_name, connection: repository.connection },
                    {
                      onSuccess: () => toast.success(`The webhook on ${repository.full_name} was registered again.`),
                      onError: error => toastError(`Could not register the webhook on ${repository.full_name}`, error),
                    },
                  )
                }
              >
                <Webhook /> Re-register webhook
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onDeliveries}>
              <ScrollText /> Delivery log
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function LinkToProject({ repository }: { repository: GitRepository }) {
  const [open, setOpen] = useState(false);
  const projects = useProjects({}, open);
  const link = useLinkRepositoryTo();
  const choices = (projects.data ?? []).filter(p => !p.is_archived);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2 font-normal text-text-secondary group-hover/repo:text-text"
          disabled={link.isPending}
        >
          <Plus /> Link to project
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Project" />
          <CommandList>
            <CommandEmpty>{projects.isPending ? 'Loading projects…' : 'No project matches.'}</CommandEmpty>
            {choices.map(project => (
              <CommandItem
                key={project.key}
                value={`${project.key} ${project.name}`}
                onSelect={() => {
                  setOpen(false);
                  link.mutate(
                    { project: project.key, repository: repository.full_name, connection: repository.connection },
                    {
                      onSuccess: () => toast.success(`${repository.full_name} is linked to ${project.name}.`),
                      onError: error => toastError(`Could not link ${repository.full_name} to ${project.name}`, error),
                    },
                  );
                }}
              >
                <ProjectMark project={project} size="xs" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <span className="font-mono text-2xs text-text-secondary">{project.key}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CopyUrlButton({ url }: { url: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        toast.success('Payload URL copied.');
      }}
    >
      <Copy /> Copy payload URL
    </Button>
  );
}

function RepositoriesSkeleton() {
  return (
    <div className="overflow-x-auto" role="status" aria-label="Loading repositories">
      <TableSkeleton
        className="min-w-[820px]"
        rows={4}
        rowClassName="h-11"
        columns={COLUMNS.map(className => (className ? { className: `${className} *:max-w-full` } : {}))}
      />
    </div>
  );
}
