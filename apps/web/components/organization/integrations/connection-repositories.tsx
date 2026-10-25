'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Lock, MoreHorizontal, Plus, RefreshCw, Search, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import type { GitConnection, GitRepository } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { RelativeTime } from '@components/relative-time';
import { HueDot } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
import {
  GIT_PAGE,
  useGitRepositories,
  useLinkRepositoryTo,
  useRehookGitRepository,
  useResyncGitRepository,
} from '@hooks/use-git';
import { useDebounced } from '@hooks/use-debounced';
import { useProjects } from '@hooks/use-projects';
import { WEBHOOK_STATUS } from '@lib/git/words';
import { formatCount } from '@lib/numbers';
import { cn } from '@lib/utils';

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
  const rows = repositories.data?.data ?? [];
  const total = repositories.data?.meta.pagination?.total ?? rows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-xs">
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
        <FormAlert title="The repositories could not be loaded.">
          <button type="button" onClick={() => void repositories.refetch()}>
            Try again
          </button>
        </FormAlert>
      ) : rows.length === 0 ? (
        <EmptyState
          title={query ? `No repository matches “${query}”.` : 'This connection sees no repositories yet.'}
          description={
            query
              ? 'Clear the search to see every repository.'
              : connection.auth_kind === 'manual'
                ? 'A repository appears once its first webhook delivery arrives, or with a token, on Refresh.'
                : 'Refresh asks the provider again; check which repositories the installation or token may read.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[820px] table-fixed text-sm">
            <thead className="bg-app text-left text-2xs text-text-secondary">
              <tr>
                <th className="h-7 px-3 font-medium">Repository</th>
                <th className="w-44 px-3 font-medium">Linked to</th>
                <th className="w-44 px-3 font-medium">Webhook</th>
                <th className="w-28 px-3 font-medium">Last event</th>
                <th className="w-12 px-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(repository => (
                <RepositoryRow
                  key={repository.full_name}
                  slug={slug}
                  repository={repository}
                  onDeliveries={() => onDeliveries(repository.full_name)}
                />
              ))}
            </tbody>
          </table>
        </div>
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

function RepositoryRow({
  slug,
  repository,
  onDeliveries,
}: {
  slug: string;
  repository: GitRepository;
  onDeliveries: () => void;
}) {
  const resync = useResyncGitRepository(slug);
  const rehook = useRehookGitRepository(slug);
  const webhook = WEBHOOK_STATUS[repository.webhook_status];
  const dim = repository.removed || repository.is_archived;

  return (
    <tr className={cn('h-11 align-middle', dim && 'text-text-muted')}>
      <td className="px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderGlyph provider={repository.provider} className="text-text-muted" />
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
          <span className="flex flex-wrap gap-1">
            {repository.projects.map(key => (
              <Link
                key={key}
                href={`/projects/${key}/settings?tab=repositories` as Route}
                className="inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-2xs text-text-secondary hover:border-border-strong hover:text-text"
              >
                {key}
              </Link>
            ))}
            {repository.match_all_projects ? <span className="text-2xs text-text-muted">· every project</span> : null}
          </span>
        ) : repository.removed ? (
          <span className="text-xs text-text-muted">--</span>
        ) : (
          <LinkToProject repository={repository} />
        )}
      </td>
      <td className="px-3">
        {repository.projects.length === 0 && repository.webhook_status === 'missing' ? (
          <span className="text-xs text-text-muted">Not needed until linked</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <HueDot hue={webhook.hue} />
            {webhook.label}
            {repository.webhook_last_status_code !== null ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help font-mono text-2xs text-text-muted">
                    {repository.webhook_last_status_code}
                  </span>
                </TooltipTrigger>
                <TooltipContent>The provider’s HTTP status on its last delivery</TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        )}
      </td>
      <td className="px-3">
        {repository.last_event_at ? (
          <RelativeTime value={repository.last_event_at} className="text-xs whitespace-nowrap" />
        ) : (
          <span className="text-xs text-text-muted">None yet</span>
        )}
      </td>
      <td className="px-3 text-right">
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
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={repository.removed || resync.isPending}
              onSelect={() =>
                resync.mutate(repository.full_name, {
                  onSuccess: () => toast.success(`${repository.full_name} is being re-read from the provider.`),
                  onError: error => toast.error(error.message),
                })
              }
            >
              <RefreshCw /> Re-sync now
            </DropdownMenuItem>
            {repository.webhook_status === 'missing' || repository.webhook_status === 'failing' ? (
              <DropdownMenuItem
                disabled={rehook.isPending}
                onSelect={() =>
                  rehook.mutate(repository.full_name, {
                    onSuccess: () => toast.success(`The webhook on ${repository.full_name} was registered again.`),
                    onError: error => toast.error(error.message),
                  })
                }
              >
                <Webhook /> Re-register webhook
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={onDeliveries}>
              <Search /> Deliveries for this repository
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
        <Button variant="ghost" size="xs" className="-ml-2 text-text-secondary" disabled={link.isPending}>
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
                      onError: error => toast.error(error.message),
                    },
                  );
                }}
              >
                <span className="w-12 font-mono text-2xs text-text-secondary">{project.key}</span>
                <span className="truncate">{project.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RepositoriesSkeleton() {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading repositories">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-6 px-3">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
