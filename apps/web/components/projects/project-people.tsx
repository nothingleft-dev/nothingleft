'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Eye, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, UserMinus, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PROJECT_ROLES, type Project, type ProjectRole } from '@nothingleft/types';
import { LoadError, errorDetail } from '@components/query-state';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { EmptyState } from '@components/empty-state';
import { Skeleton } from '@components/ui/skeleton';
import { RelativeTime } from '@components/relative-time';
import { FormAlert } from '@components/auth/form-alert';
import { SettingsSection } from '@components/settings/section';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { useApiError } from '@hooks/use-api-error';
import { useMembers } from '@hooks/use-members';
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
  useUpdateProjectMember,
} from '@hooks/use-projects';
import { PROJECT_ROLE_HINTS, PROJECT_ROLE_LABELS } from '@lib/roles';
import { deactivatedInk, InactiveChip } from '@components/former-member-chip';
import { MemberAvatar } from '@components/issues/member-avatar';
import { cn } from '@lib/utils';
import { PendingButton } from '@components/pending-button';

const ROLE_OPTIONS: ChoiceOption<ProjectRole>[] = PROJECT_ROLES.map(value => ({
  value,
  label: PROJECT_ROLE_LABELS[value],
  hint: PROJECT_ROLE_HINTS[value],
}));

export function ProjectPeople({
  project,
  orgSlug,
  canEdit,
}: {
  project: Project;
  orgSlug: string | null;
  canEdit: boolean;
}) {
  const members = useProjectMembers(project.key);
  const add = useAddProjectMember(project.key);
  const update = useUpdateProjectMember(project.key);
  const remove = useRemoveProjectMember(project.key);
  const error = useApiError(add.error ?? update.error ?? remove.error, []);

  const [role, setRole] = useState<ProjectRole>('contributor');
  const [search, setSearch] = useState('');
  const all = members.data ?? [];
  const needle = search.trim().toLowerCase().replace(/^@/, '');
  const rows = needle
    ? all.filter(m => m.name.toLowerCase().includes(needle) || m.username.toLowerCase().includes(needle))
    : all;

  return (
    <SettingsSection
      title="People"
      description="Who works in this project, and what each of them may change. Org Admins reach every project whether or not they are listed."
      actions={
        canEdit && orgSlug ? (
          <AddMember
            orgSlug={orgSlug}
            exclude={all.map(r => r.username)}
            pending={add.isPending}
            role={role}
            onRole={setRole}
            onPick={username => add.mutate({ username, role }, { onSuccess: m => toast.success(`${m.name} added.`) })}
          />
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {error.summary ? <FormAlert title={error.summary} /> : null}

        {members.isPending ? (
          <div className="flex items-center gap-3" aria-hidden>
            <Skeleton className="h-control max-w-sm flex-1 rounded-md" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : all.length > 0 ? (
          <div className="flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-icon-sm -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or username"
                aria-label="Search people in this project"
                className="h-control w-full rounded-md border bg-surface pr-3 pl-8 text-sm text-text placeholder:text-text-muted hover:border-border-strong focus:border-border-strong"
              />
            </div>
            <span className="text-xs text-text-secondary tabular" aria-live="polite">
              {needle ? `${rows.length} of ${all.length}` : all.length} {all.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        ) : null}

        {members.isPending ? (
          <PeopleSkeleton />
        ) : members.isError && all.length === 0 ? (
          <LoadError onRetry={() => void members.refetch()} detail={errorDetail(members.error)}>
            The people in this project could not be loaded.
          </LoadError>
        ) : all.length === 0 ? (
          <EmptyState
            title="Nobody has been added yet."
            description={
              canEdit
                ? 'Add people from the organisation with Add someone, or invite someone new by email or link.'
                : 'A Project Admin adds people from the organisation, or invites someone new.'
            }
            action={
              canEdit ? (
                <Link
                  href={`/projects/${project.key}/settings?tab=invites` as Route}
                  className="action-link rounded-xs text-xs font-medium text-text"
                >
                  Go to Invites
                </Link>
              ) : null
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="Nobody here matches." description="Clear the search to see everyone." />
        ) : (
          <div className="rounded-md border">
            <div
              aria-hidden
              className={cn(
                PEOPLE_GRID,
                'h-7 items-center rounded-t-md border-b bg-app text-2xs font-medium text-text-secondary',
              )}
            >
              <span>Person</span>
              <span>Project role</span>
              <span className="max-sm:hidden">Added</span>
              <span className="max-sm:hidden" />
              <span />
            </div>
            <ul className="flex flex-col divide-y divide-border-subtle">
              {rows.map(member => (
                <li
                  key={member.username}
                  className={cn(
                    PEOPLE_GRID,
                    'h-row-lg items-center last:rounded-b-md hover:bg-hover has-[[data-state=open]]:bg-hover',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <MemberAvatar member={member} className="size-avatar" initialsClassName="text-[10px]" />
                    <span className="flex min-w-0 flex-col leading-4">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn('truncate font-medium', deactivatedInk(member))}>{member.name}</span>
                        {member.deactivated ? <InactiveChip /> : null}
                      </span>
                      <span className="truncate font-mono text-xs text-text-muted">@{member.username}</span>
                    </span>
                  </span>

                  <span className="truncate text-xs text-text-secondary">{PROJECT_ROLE_LABELS[member.role]}</span>
                  <span className="text-xs text-text-secondary tabular max-sm:hidden">
                    <RelativeTime value={member.added_at} />
                  </span>
                  <span className="max-sm:hidden" />

                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.name}`}>
                          <MoreHorizontal className="size-icon-sm" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {PROJECT_ROLES.filter(r => r !== member.role).map(r => {
                          const Icon = ROLE_ICON[r];
                          return (
                            <DropdownMenuItem
                              key={r}
                              onSelect={() =>
                                update.mutate(
                                  { username: member.username, body: { role: r } },
                                  {
                                    onSuccess: () => toast.success(`${member.name} is now ${PROJECT_ROLE_LABELS[r]}.`),
                                  },
                                )
                              }
                            >
                              <Icon /> Make {PROJECT_ROLE_LABELS[r]}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            remove.mutate(member.username, {
                              onSuccess: () => toast.success(`${member.name} was removed from ${project.key}.`),
                            })
                          }
                        >
                          <UserMinus /> Remove from project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="size-8" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

function AddMember({
  orgSlug,
  exclude,
  pending,
  role,
  onRole,
  onPick,
}: {
  orgSlug: string;
  exclude: string[];
  pending: boolean;
  role: ProjectRole;
  onRole: (role: ProjectRole) => void;
  onPick: (username: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const members = useMembers(orgSlug, q ? { q } : {});
  const candidates = (members.data ?? []).filter(m => !exclude.includes(m.username));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PendingButton size="sm" pending={pending} pendingLabel="Adding…">
          <Plus className="size-icon-sm" /> Add someone
        </PendingButton>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] max-w-[calc(100vw-32px)] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search the organisation…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>Everybody matching is already here.</CommandEmpty>
            {candidates.map(member => (
              <CommandItem
                key={member.username}
                value={member.username}
                onSelect={() => {
                  onPick(member.username);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{member.name || `@${member.username}`}</span>
                {member.name ? (
                  <span className="max-w-[45%] min-w-0 truncate font-mono text-xs text-text-secondary">
                    @{member.username}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <div className="flex items-center gap-3 border-t px-3 py-2">
          <span className="text-sm font-medium text-text-secondary" aria-hidden>
            Add as
          </span>
          <ChoiceSelect
            label="Add as"
            hideLabel
            value={role}
            options={ROLE_OPTIONS}
            onChange={onRole}
            className="flex-1"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

const PEOPLE_GRID =
  'grid gap-x-4 px-3 grid-cols-[minmax(0,1fr)_7rem_2rem] sm:grid-cols-[minmax(12rem,26rem)_9rem_8rem_minmax(0,1fr)_2rem]';

const ROLE_ICON: Record<ProjectRole, LucideIcon> = {
  project_admin: ShieldCheck,
  contributor: Pencil,
  observer: Eye,
};

function PeopleSkeleton() {
  return (
    <div className="rounded-md border" aria-hidden>
      <div className={cn(PEOPLE_GRID, 'h-7 items-center rounded-t-md border-b bg-app')}>
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-2.5 w-10 max-sm:hidden" />
      </div>
      <div className="flex flex-col divide-y divide-border-subtle">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn(PEOPLE_GRID, 'h-row-lg items-center')}>
            <span className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-avatar flex-none rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3" style={{ width: `${45 + ((i * 17) % 25)}%` }} />
                <Skeleton className="h-2.5 w-24" />
              </span>
            </span>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20 max-sm:hidden" />
            <span className="max-sm:hidden" />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
