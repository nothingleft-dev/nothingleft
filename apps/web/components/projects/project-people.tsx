'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PROJECT_ROLES, type Project, type ProjectRole } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { EmptyState } from '@components/empty-state';
import { RowsSkeleton } from '@components/skeletons';
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
  const error = useApiError(add.error ?? update.error ?? remove.error);

  const [role, setRole] = useState<ProjectRole>('contributor');
  const rows = members.data ?? [];

  return (
    <SettingsSection
      title="People"
      description="Who works in this project, and what each of them may change. Org Admins reach every project whether or not they are listed."
    >
      <div className="flex flex-col gap-4">
        {error.summary ? <FormAlert title={error.summary} /> : null}

        {canEdit && orgSlug ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[240px]">
              <ChoiceSelect label="Add as" value={role} options={ROLE_OPTIONS} onChange={setRole} />
            </div>
            <AddMember
              orgSlug={orgSlug}
              exclude={rows.map(r => r.username)}
              pending={add.isPending}
              onPick={username => add.mutate({ username, role }, { onSuccess: m => toast.success(`${m.name} added.`) })}
            />
          </div>
        ) : null}

        {members.isPending ? (
          <RowsSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nobody has been added yet."
            description="Add people from the organisation above, or invite new ones from the Invites tab."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
            {rows.map(member => (
              <li key={member.username} className="flex h-row-lg items-center gap-3 px-3">
                <MemberAvatar member={member} className="size-avatar" initialsClassName="text-[10px]" />

                <div className="flex min-w-0 flex-1 flex-col leading-4">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn('truncate font-medium', deactivatedInk(member))}>{member.name}</span>
                    {member.deactivated ? <InactiveChip /> : null}
                  </span>
                  <span className="truncate font-mono text-xs text-text-muted">@{member.username}</span>
                </div>

                <span className="w-32 text-xs text-text-secondary">{PROJECT_ROLE_LABELS[member.role]}</span>
                <RelativeTime value={member.added_at} className="w-24 text-right text-xs max-sm:hidden" />

                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Manage ${member.name}`}>
                        <MoreHorizontal className="size-icon-sm" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {PROJECT_ROLES.filter(r => r !== member.role).map(r => (
                        <DropdownMenuItem
                          key={r}
                          onSelect={() =>
                            update.mutate(
                              { username: member.username, body: { role: r } },
                              { onSuccess: () => toast.success(`${member.name} is now ${PROJECT_ROLE_LABELS[r]}.`) },
                            )
                          }
                        >
                          Make {PROJECT_ROLE_LABELS[r]}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                          remove.mutate(member.username, {
                            onSuccess: () => toast.success(`${member.name} was removed from ${project.key}.`),
                          })
                        }
                      >
                        Remove from project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="size-8" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}

function AddMember({
  orgSlug,
  exclude,
  pending,
  onPick,
}: {
  orgSlug: string;
  exclude: string[];
  pending: boolean;
  onPick: (username: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const members = useMembers(orgSlug, q ? { q } : {});
  const candidates = (members.data ?? []).filter(m => !exclude.includes(m.username));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <Plus className="size-icon-sm" /> {pending ? 'Adding…' : 'Add someone'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
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
                <span className="flex-1 truncate">{member.name}</span>
                <span className="font-mono text-xs text-text-muted">@{member.username}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
