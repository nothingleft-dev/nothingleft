'use client';

import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_ACTIVITY_KINDS, type OrgActivityKind, type Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { EmptyState } from '@components/empty-state';
import { RowsSkeleton } from '@components/skeletons';
import { RelativeTime } from '@components/relative-time';
import { FormAlert } from '@components/auth/form-alert';
import { DatePicker } from '@components/date-picker';
import { ACTIVITY_LABELS, activityDetail } from '@components/organization/activity-labels';
import { FormerMemberChip, deactivatedInk } from '@components/former-member-chip';
import { useActivity, useActivityExport } from '@hooks/use-activity';
import { useMembers } from '@hooks/use-members';
import type { ActivityFilters } from '@lib/api/activity';
import { cn } from '@lib/utils';
import { MemberAvatar } from '@components/issues/member-avatar';

export function AuditTab({ organization }: { organization: Organization }) {
  const [filters, setFilters] = useState<ActivityFilters>({});
  const activity = useActivity(organization.slug, filters);
  const exportCsv = useActivityExport(organization.slug);

  const rows = activity.data?.rows ?? [];
  const filtered =
    filters.actor !== undefined ||
    (filters.kind?.length ?? 0) > 0 ||
    filters.from !== undefined ||
    filters.to !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActorFilter
          slug={organization.slug}
          value={filters.actor ?? null}
          onChange={actor => setFilters(f => ({ ...f, actor: actor ?? undefined }))}
        />
        <KindFilter
          value={filters.kind ?? []}
          onChange={kind => setFilters(f => ({ ...f, kind: kind.length > 0 ? kind : undefined }))}
        />
        <DatePicker
          label="From"
          value={filters.from ?? null}
          onChange={from => setFilters(f => ({ ...f, from: from ?? undefined }))}
        />
        <DatePicker
          label="To"
          value={filters.to ?? null}
          onChange={to => setFilters(f => ({ ...f, to: to ?? undefined }))}
        />

        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            <X className="size-icon-sm" /> Clear
          </Button>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={exportCsv.isPending}
          onClick={() =>
            exportCsv.mutate(filters, {
              onError: e => toast.error(e instanceof Error ? e.message : 'The export failed.'),
            })
          }
        >
          <Download className="size-icon-sm" />
          {exportCsv.isPending ? 'Preparing…' : 'Download CSV'}
        </Button>
      </div>

      {activity.isError ? <FormAlert title="The audit log could not be loaded." /> : null}

      {activity.isPending ? (
        <RowsSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nothing matches those filters.' : 'Nothing has happened yet.'}
          description={
            filtered
              ? 'Widen the dates, or clear the filters to see everything.'
              : 'Every invitation, role change and project change is recorded here, permanently and without coalescing.'
          }
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
            {rows.map(row => {
              const detail = activityDetail(row);
              return (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                  <MemberAvatar member={row.actor ?? { name: '-', avatar_url: null }} initialsClassName="text-[10px]" />

                  <div className="flex min-w-0 flex-1 flex-col leading-5">
                    <span className="truncate">
                      <span className={cn('font-medium', deactivatedInk(row.actor))}>
                        {row.actor?.name ?? 'Somebody no longer here'}
                      </span>{' '}
                      {row.actor?.former_member ? <FormerMemberChip className="mr-1 align-middle" /> : null}
                      {ACTIVITY_LABELS[row.kind]}
                    </span>
                    {detail ? <span className="truncate font-mono text-xs text-text-muted">{detail}</span> : null}
                  </div>

                  {row.ip ? <span className="font-mono text-xs text-text-muted max-md:hidden">{row.ip}</span> : null}
                  <RelativeTime value={row.created_at} className="w-24 text-right text-xs" />
                </li>
              );
            })}
          </ul>

          {activity.hasNextPage ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={activity.isFetchingNextPage}
              onClick={() => void activity.fetchNextPage()}
            >
              {activity.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActorFilter({
  slug,
  value,
  onChange,
}: {
  slug: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const members = useMembers(slug, q ? { q } : {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label="Filter by who did it">
          {value ? `@${value}` : 'Anyone'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search members…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>Nobody matches that.</CommandEmpty>
            <CommandItem
              value="__anyone"
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Anyone
            </CommandItem>
            {(members.data ?? []).map(member => (
              <CommandItem
                key={member.username}
                value={member.username}
                onSelect={() => {
                  onChange(member.username);
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

function KindFilter({
  value,
  onChange,
}: {
  value: readonly OrgActivityKind[];
  onChange: (v: OrgActivityKind[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const label =
    value.length === 0
      ? 'Every kind'
      : value.length === 1
        ? ACTIVITY_LABELS[value[0] as OrgActivityKind]
        : `${value.length} kinds`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Filter by kind"
          className="max-w-[220px]"
        >
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter kinds…" />
          <CommandList>
            <CommandEmpty>No kind matches that.</CommandEmpty>
            {ORG_ACTIVITY_KINDS.map(kind => {
              const on = value.includes(kind);
              return (
                <CommandItem
                  key={kind}
                  value={`${kind} ${ACTIVITY_LABELS[kind]}`}
                  onSelect={() => onChange(on ? value.filter(k => k !== kind) : [...value, kind])}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-4 flex-none place-items-center rounded-xs border text-[9px]',
                      on && 'border-ink bg-ink text-ink-fg',
                    )}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="flex-1 truncate">{ACTIVITY_LABELS[kind]}</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
