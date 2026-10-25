'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Lock, Plus, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import type { GitRepository, ProjectRepository } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Switch } from '@components/ui/switch';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { ConfirmDialog } from '@components/confirm-dialog';
import { FormAlert } from '@components/auth/form-alert';
import { JobStatus } from '@components/job-status';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { PickerSkeleton } from '@components/issues/pickers';
import { HueDot } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { BranchChips } from '@components/projects/automations/branch-chips';
import { TemplateOffer } from '@components/projects/automations/templates';
import {
  useGitRepositories,
  useLinkRepository,
  useProjectRepositories,
  useUnlinkRepository,
  useUpdateRepositoryLink,
} from '@hooks/use-git';
import { useDebounced } from '@hooks/use-debounced';
import { WEBHOOK_STATUS, count } from '@lib/git/words';
import { formatDate, formatDateTimeWithZone } from '@lib/datetime';
import { repositoryLocks } from '@lib/git/repository-locks';
import { cn } from '@lib/utils';

interface RepositoriesSettingsProps {
  projectKey: string;
  orgSlug: string | null;
  canEdit: boolean;
  orgAdmin: boolean;
  readOnlyReason: string;
}

export function RepositoriesSettings({
  projectKey,
  orgSlug,
  canEdit,
  orgAdmin,
  readOnlyReason,
}: RepositoriesSettingsProps) {
  const repositories = useProjectRepositories(projectKey);
  const [offer, setOffer] = useState(false);
  const rows = repositories.data ?? [];

  return (
    <>
      <SettingsSection
        title="Linked repositories"
        description="Branches, commits and pull requests in these repositories that name one of this project’s issues show on that issue."
        actions={
          canEdit && orgSlug ? (
            <LinkRepositoryPicker
              projectKey={projectKey}
              orgSlug={orgSlug}
              orgAdmin={orgAdmin}
              linked={rows}
              onLinked={first => (first ? setOffer(true) : null)}
            />
          ) : null
        }
      >
        {canEdit ? null : <p className="text-xs text-text-secondary">{readOnlyReason}</p>}
        {offer ? <TemplateOffer projectKey={projectKey} onDone={() => setOffer(false)} /> : null}
        {repositories.isPending ? (
          <RowsSkeleton />
        ) : repositories.isError && !repositories.data ? (
          <FormAlert title="The repositories could not be loaded.">
            <button type="button" onClick={() => void repositories.refetch()}>
              Try again
            </button>
          </FormAlert>
        ) : rows.length === 0 ? (
          <NoRepository projectKey={projectKey} canEdit={canEdit} />
        ) : (
          <ul className="divide-y divide-border-subtle rounded-md border">
            {rows.map(repository => (
              <RepositoryRow
                key={repository.full_name}
                projectKey={projectKey}
                repository={repository}
                canEdit={canEdit}
                orgAdmin={orgAdmin}
              />
            ))}
          </ul>
        )}
      </SettingsSection>
    </>
  );
}

function NoRepository({ projectKey, canEdit }: { projectKey: string; canEdit: boolean }) {
  const lower = projectKey.toLowerCase();
  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed px-4 py-5">
      <p className="font-medium">No repository is linked yet.</p>
      <p className="text-xs text-text-secondary">
        {canEdit
          ? 'Link one and every issue of this project can show its development. Then name an issue in any of three places:'
          : 'Once a Project Admin links one, name an issue in any of three places and it shows on the issue:'}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-text-secondary">A branch name</dt>
        <dd className="font-mono">feat/{lower}-12-login</dd>
        <dt className="text-text-secondary">A commit message</dt>
        <dd className="font-mono">{projectKey}-12: keep the return path</dd>
        <dt className="text-text-secondary">A pull request title or description</dt>
        <dd className="font-mono">Fixes {projectKey}-12</dd>
      </dl>
      <p className="text-xs text-text-secondary">
        Nothing git-related shows anywhere in the project until a repository is linked.
      </p>
    </div>
  );
}

function BackfillState({ repository }: { repository: ProjectRepository }) {
  const b = repository.backfill;
  if (!b) return null;
  const read = `${count(b.pull_requests, 'pull request')}, ${count(b.branches, 'branch', 'branches')}`;
  if (b.state === 'queued') return <JobStatus tone="waiting" label="Reading history soon" className="text-xs" />;
  if (b.state === 'running') return <JobStatus tone="moving" label={`Reading history · ${read}`} className="text-xs" />;
  if (b.state === 'failed') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">
            <JobStatus tone="failed" label="History not read" className="text-xs" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{b.error ?? 'The provider did not answer.'}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span
      className="text-xs text-text-secondary"
      title={b.finished_at ? formatDateTimeWithZone(b.finished_at) : undefined}
    >
      History read{b.finished_at ? ` ${formatDate(b.finished_at)}` : ''} · {read}
    </span>
  );
}

function RepositoryRow({
  projectKey,
  repository,
  canEdit,
  orgAdmin,
}: {
  projectKey: string;
  repository: ProjectRepository;
  canEdit: boolean;
  orgAdmin: boolean;
}) {
  const locks = repositoryLocks(repository, orgAdmin);
  const update = useUpdateRepositoryLink(projectKey);
  const unlink = useUnlinkRepository(projectKey);
  const [confirming, setConfirming] = useState(false);
  const shared = repository.projects.filter(k => k !== projectKey);
  const webhook = WEBHOOK_STATUS[repository.webhook_status];
  const dim = repository.removed || repository.is_archived;
  const patch = (body: Parameters<typeof update.mutate>[0]['body']) =>
    update.mutate(
      { repository: repository.full_name, body: { ...body, connection: repository.connection } },
      { onError: error => toast.error(error.message) },
    );

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ProviderGlyph provider={repository.provider} className="text-text-muted" />
        <a
          href={repository.html_url}
          target="_blank"
          rel="noreferrer noopener"
          className={cn('font-mono text-sm font-medium hover:underline', dim && 'text-text-muted')}
        >
          {repository.full_name}
        </a>
        {repository.is_private ? <Lock aria-label="Private" className="size-3 text-text-muted" /> : null}
        {repository.removed ? <span className="text-2xs text-danger-fg">removed at the provider</span> : null}
        {repository.is_archived ? <span className="text-2xs text-text-muted">archived</span> : null}
        <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
          <HueDot hue={webhook.hue} />
          {webhook.label}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <BackfillState repository={repository} />
          {canEdit ? (
            <Button variant="ghost" size="xs" className="text-text-secondary" onClick={() => setConfirming(true)}>
              <Unlink /> Unlink
            </Button>
          ) : null}
        </span>
      </div>

      <dl className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 text-xs">
        <dt className="text-text-secondary">Merged into</dt>
        <dd>
          <span className="flex flex-col gap-1">
            <BranchChips
              repository={repository}
              disabled={!canEdit || locks.branches !== null}
              onChange={branches => patch({ merge_base_branches: branches })}
            />
            {canEdit && locks.branches ? <span className="text-2xs text-text-secondary">{locks.branches}</span> : null}
          </span>
        </dd>
        <dt className="text-text-secondary">Every project</dt>
        <dd className="flex items-center gap-2">
          <Switch
            checked={repository.match_all_projects}
            disabled={!canEdit || locks.everyProject !== null}
            aria-label="Reference issues of every project in the organisation"
            onCheckedChange={value => patch({ match_all_projects: value })}
          />
          <span className="text-text-secondary">
            {repository.match_all_projects
              ? 'Names an issue of any project in the organisation.'
              : 'Names only issues of projects it is linked to.'}
            {canEdit && locks.everyProject ? ` ${locks.everyProject}` : ''}
          </span>
        </dd>
      </dl>
      <p className="text-2xs text-text-muted">
        Both belong to the repository, so they change for every project it is linked to
        {shared.length > 0 ? ` (also ${shared.join(', ')})` : ''}. Linked
        {repository.linked_by ? (
          <>
            {' '}
            by <PersonName person={repository.linked_by} />
          </>
        ) : null}{' '}
        <RelativeTime value={repository.linked_at} className="text-text-muted" />.
      </p>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Unlink ${repository.full_name}?`}
        confirmLabel="Unlink repository"
        pending={unlink.isPending}
        onConfirm={() =>
          unlink
            .mutateAsync({ repository: repository.full_name, connection: repository.connection })
            .then(
              () => toast.success(`${repository.full_name} is no longer linked to ${projectKey}.`),
              (error: Error) => toast.error(error.message),
            )
            .finally(() => setConfirming(false))
        }
      >
        <p>
          New branches, commits and pull requests in it stop reaching this project’s issues, and its git automations
          stop firing for them.
        </p>
        <p>
          What is already linked stays on each issue as history. Linking it again picks up from there. If it is the
          project’s last repository, everything git-related hides until one is linked.
        </p>
      </ConfirmDialog>
    </li>
  );
}

function LinkRepositoryPicker({
  projectKey,
  orgSlug,
  orgAdmin,
  linked,
  onLinked,
}: {
  projectKey: string;
  orgSlug: string;
  orgAdmin: boolean;
  linked: readonly ProjectRepository[];
  onLinked: (first: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const available = useGitRepositories(orgSlug, { project: projectKey, ...(query ? { q: query } : {}) }, open);
  const link = useLinkRepository(projectKey);

  const groups = useMemo(() => {
    const taken = new Set(linked.map(r => `${r.connection} ${r.full_name}`));
    const byConnection = new Map<string, GitRepository[]>();
    for (const repository of available.data?.data ?? []) {
      if (taken.has(`${repository.connection} ${repository.full_name}`) || repository.removed) continue;
      byConnection.set(repository.connection, [...(byConnection.get(repository.connection) ?? []), repository]);
    }
    return [...byConnection.entries()];
  }, [available.data, linked]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" disabled={link.isPending}>
          <Plus /> {link.isPending ? 'Linking…' : 'Link repository'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-32px)] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Find a repository" value={q} onValueChange={setQ} />
          <CommandList>
            {available.isPending ? (
              <PickerSkeleton />
            ) : available.isError ? (
              <p className="px-3 py-3 text-xs text-danger-fg">{available.error.message}</p>
            ) : (
              <CommandEmpty>
                {query
                  ? `No repository matches “${query}”.`
                  : (available.data?.meta.pagination?.total ?? 0) > (available.data?.data.length ?? 0)
                    ? 'Search to find the rest of the organisation’s repositories.'
                    : 'Every repository the organisation can see is linked here already.'}
              </CommandEmpty>
            )}
            {groups.map(([connection, repositories]) => (
              <CommandGroup key={connection} heading={connection}>
                {repositories.map(repository => (
                  <CommandItem
                    key={repository.full_name}
                    value={`${repository.connection} ${repository.full_name}`}
                    onSelect={() => {
                      setOpen(false);
                      link.mutate(
                        {
                          repository: repository.full_name,
                          body: { connection: repository.connection, backfill: true },
                        },
                        {
                          onSuccess: () => {
                            toast.success(`${repository.full_name} is linked. Its recent history is being read.`);
                            onLinked(linked.length === 0);
                          },
                          onError: error => toast.error(error.message),
                        },
                      );
                    }}
                  >
                    <ProviderGlyph provider={repository.provider} className="text-text-muted" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{repository.full_name}</span>
                    {repository.projects.length > 0 ? (
                      <span className="text-2xs text-text-muted">also {repository.projects.join(', ')}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <p className="border-t px-3 py-2 text-2xs text-text-secondary">
          {orgAdmin ? (
            <>
              Not listed?{' '}
              <Link href={'/organization?tab=integrations' as Route} className="text-text underline">
                Connect another account in Organisation settings
              </Link>
              .
            </>
          ) : (
            'Not listed? Ask an Org Admin to connect the account it belongs to.'
          )}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-border-subtle rounded-md border" role="status" aria-label="Loading repositories">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 px-4 py-4">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-80" />
          <Skeleton className="h-3 w-64" />
        </div>
      ))}
    </div>
  );
}
