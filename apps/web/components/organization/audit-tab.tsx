'use client';

import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { ORG_ACTIVITY_KINDS, type OrgActivityKind, type Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CommandEmpty, CommandInput, CommandList } from '@components/ui/command';
import { PickerCommand, PickerItem } from '@components/picker';
import { Popover, PopoverContent, PopoverTrigger } from '@components/popover';
import { EmptyState } from '@components/empty-state';
import { RowsSkeleton } from '@components/skeletons';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { DatePicker } from '@components/date-picker';
import { ACTIVITY_LABELS, activityDetail, activityLabel } from '@components/organization/activity-labels';
import { PersonName } from '@components/former-member-chip';
import { useActivity, useActivityExport } from '@hooks/use-activity';
import { useMembers } from '@hooks/use-members';
import type { ActivityFilters } from '@lib/api/activity';
import { MemberAvatar } from '@components/issues/member-avatar';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';
import { LoadMore } from '@components/text-button';

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

        <PendingButton
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() =>
            exportCsv.mutate(filters, {
              onError: e => toastError('Could not download the audit log', e),
            })
          }
          pending={exportCsv.isPending}
          pendingLabel="Preparing…"
        >
          <Download className="size-icon-sm" />
          Download CSV
        </PendingButton>
      </div>

      {activity.isPending ? (
        <RowsSkeleton rows={8} columns={['avatar', 'lines', 'meta']} />
      ) : !activity.data ? (
        <LoadError onRetry={() => void activity.refetch()} detail={errorDetail(activity.error)}>
          The audit log could not be loaded.
        </LoadError>
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
                      {row.actor ? (
                        <PersonName person={row.actor} className="max-w-full align-bottom font-medium" />
                      ) : (
                        <span className="font-medium">Somebody no longer here</span>
                      )}{' '}
                      {activityLabel(row)}
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
            <LoadMore pending={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
              Show more
            </LoadMore>
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
        <PickerCommand shouldFilter={false}>
          <CommandInput placeholder="Search members…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>Nobody matches that.</CommandEmpty>
            <PickerItem
              checked={value === null}
              value="__anyone"
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Anyone
            </PickerItem>
            {(members.data ?? []).map(member => (
              <PickerItem
                key={member.username}
                checked={member.username === value}
                value={member.username}
                onSelect={() => {
                  onChange(member.username);
                  setOpen(false);
                }}
              >
                <span className="flex-1 truncate">{member.name}</span>
                <span className="font-mono text-xs text-text-muted">@{member.username}</span>
              </PickerItem>
            ))}
          </CommandList>
        </PickerCommand>
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
        <PickerCommand>
          <CommandInput placeholder="Filter kinds…" />
          <CommandList>
            <CommandEmpty>No kind matches that.</CommandEmpty>
            {ORG_ACTIVITY_KINDS.map(kind => {
              const on = value.includes(kind);
              return (
                <PickerItem
                  key={kind}
                  checked={on}
                  value={`${kind} ${ACTIVITY_LABELS[kind]}`}
                  onSelect={() => onChange(on ? value.filter(k => k !== kind) : [...value, kind])}
                >
                  <span className="flex-1 truncate">{ACTIVITY_LABELS[kind]}</span>
                </PickerItem>
              );
            })}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}
