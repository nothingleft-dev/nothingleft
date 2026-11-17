'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronsUpDown, Timer } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomField, Project, UpdateProject } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandGroup, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { Skeleton } from '@components/ui/skeleton';
import { useCustomFields } from '@hooks/use-custom-fields';
import { useUpdateProject } from '@hooks/use-projects';
import { RowChip } from '@components/projects/value-row';
import { cn } from '@lib/utils';

type Role = 'estimation_field' | 'spent_time_field';

const COPY: Record<Role, { label: string; builtin: string; hint: string }> = {
  estimation_field: {
    label: 'Estimation field',
    builtin: 'Estimation',
    hint: 'Stores how long an issue is expected to take. A duration field chosen here becomes the estimate everywhere: the sidebar, search, sprint totals and estimate against spent.',
  },
  spent_time_field: {
    label: 'Spent time field',
    builtin: 'Spent time',
    hint: 'Shows the time logged on an issue and its subtasks. A duration field chosen here mirrors that total and cannot be edited by hand.',
  },
};

/** Which field is the project's Estimation and Spent time: the built-in, or one of its duration fields. */
export function TimeFields({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const fields = useCustomFields(project.key);
  const durations = (fields.data ?? []).filter(f => f.type === 'duration' && !f.is_archived);

  return (
    <section className="flex flex-col gap-5 border-b pb-5">
      <RolePicker
        role="estimation_field"
        project={project}
        durations={durations}
        loading={fields.isPending}
        canEdit={canEdit}
      />
      <RolePicker
        role="spent_time_field"
        project={project}
        durations={durations}
        loading={fields.isPending}
        canEdit={canEdit}
      />
      {canEdit ? (
        <p className="text-xs text-text-secondary">
          Either role can be the built-in field or a Duration field from the{' '}
          <Link href={`/projects/${project.key}/settings?tab=fields` as Route} className="action-link">
            Fields tab
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

interface RolePickerProps {
  role: Role;
  project: Project;
  durations: readonly CustomField[];
  loading: boolean;
  canEdit: boolean;
}

function RolePicker({ role, project, durations, loading, canEdit }: RolePickerProps) {
  const id = useId();
  const copy = COPY[role];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProject(project.key);
  const other: Role = role === 'estimation_field' ? 'spent_time_field' : 'estimation_field';
  const current =
    update.isPending && update.variables && role in update.variables
      ? (update.variables[role] ?? null)
      : (project[role]?.slug ?? null);
  const currentName =
    current === null ? copy.builtin : (durations.find(f => f.slug === current)?.name ?? project[role]?.name ?? current);
  const choices = durations.filter(f => f.slug !== project[other]?.slug);

  const choose = (slug: string | null) => {
    setOpen(false);
    if (slug === (project[role]?.slug ?? null)) return;
    setError(null);
    const body: UpdateProject = { [role]: slug };
    update.mutate(body, {
      onSuccess: p => toast.success(`${copy.label} is now ${p[role]?.name ?? `the built-in ${copy.builtin}`}.`),
      onError: e => setError(e.message),
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-text-secondary">
        {copy.label}
      </span>
      {canEdit ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              aria-labelledby={`${id}-label`}
              aria-invalid={error ? true : undefined}
              className={cn(
                'w-full justify-start border-border-strong bg-surface px-3 font-normal has-[>svg]:px-3 sm:w-80 dark:bg-surface',
                error && 'border-danger-fg',
              )}
            >
              {loading ? (
                <Skeleton className="h-3 w-28" />
              ) : (
                <>
                  {current === null ? null : <Timer className="text-text-secondary" />}
                  <span className="truncate">{currentName}</span>
                  {current === null ? <RowChip>Built in</RowChip> : null}
                </>
              )}
              <ChevronsUpDown className="ml-auto text-text-secondary" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[280px] p-0">
            <PickerCommand>
              <CommandList>
                <PickerItem checked={current === null} value={`\u0000${copy.builtin}`} onSelect={() => choose(null)}>
                  <span className="min-w-0 flex-1 truncate">{copy.builtin}</span>
                  <RowChip>Built in</RowChip>
                </PickerItem>
                {choices.length > 0 ? (
                  <CommandGroup heading="Duration fields">
                    {choices.map(f => (
                      <PickerItem
                        checked={current === f.slug}
                        key={f.slug}
                        value={f.name}
                        onSelect={() => choose(f.slug)}
                      >
                        <Timer className="text-text-secondary" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="font-mono text-2xs text-text-secondary">{f.slug}</span>
                      </PickerItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </PickerCommand>
          </PopoverContent>
        </Popover>
      ) : (
        <span aria-labelledby={`${id}-label`} className="flex h-control items-center gap-2 text-sm">
          {loading ? (
            <Skeleton className="h-3 w-28" />
          ) : (
            <>
              {current === null ? null : <Timer className="size-icon text-text-secondary" />}
              <span className="truncate">{currentName}</span>
              {current === null ? <RowChip>Built in</RowChip> : null}
            </>
          )}
        </span>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
      <p className="max-w-2xl text-xs text-text-secondary">{copy.hint}</p>
    </div>
  );
}
