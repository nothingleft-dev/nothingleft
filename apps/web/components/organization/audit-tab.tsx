'use client';

import { useState } from 'react';
import { ChevronDown, Download, X } from 'lucide-react';
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
import {
  ACTIVITY_LABELS,
  auditLine,
  isSystemActivity,
  systemSentence,
  type DetailPart,
} from '@components/organization/activity-labels';
import { ActivityAvatar } from '@components/organization/activity-avatar';
import { PersonName } from '@components/former-member-chip';
import { useActivity, useActivityExport } from '@hooks/use-activity';
import { useMembers } from '@hooks/use-members';
import type { ActivityFilters } from '@lib/api/activity';
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
            !filtered
              ? 'Invitations, role changes and project changes appear here. Entries are never edited or merged.'
              : filters.from !== undefined || filters.to !== undefined
                ? 'Widen the dates, or clear the filters to see everything.'
                : 'Clear the filters to see everything.'
          }
          action={
            filtered ? (
              <Button variant="outline" size="sm" onClick={() => setFilters({})}>
                Clear the filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
            {rows.map(row => {
              const { headline, detail } = auditLine(row);
              return (
                <li key={row.id} className="flex min-h-row-lg items-center gap-3 px-3 py-1">
                  <ActivityAvatar row={row} className="size-avatar max-sm:mt-0.5 max-sm:self-start" />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate leading-5 max-sm:whitespace-normal">
                      {isSystemActivity(row) ? (
                        systemSentence(row)
                      ) : (
                        <>
                          {row.actor ? (
                            <PersonName person={row.actor} className="max-w-full align-bottom font-medium" />
                          ) : (
                            <span className="font-medium">Somebody no longer here</span>
                          )}{' '}
                          <Parts parts={headline} code="text-xs" />
                        </>
                      )}
                    </span>
                    {detail ? <Detail parts={detail} /> : null}
                  </div>

                  <span className="w-28 shrink-0 text-right font-mono text-2xs text-text-secondary max-md:hidden">
                    {row.ip}
                  </span>
                  <RelativeTime
                    value={row.created_at}
                    className="w-28 shrink-0 text-right text-xs tabular max-sm:w-auto max-sm:self-start"
                  />
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
          <FilterText label="Who" value={value ? `@${value}` : null} fallback="anyone" />
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
                <span className="font-mono text-2xs text-text-secondary">@{member.username}</span>
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
    value.length === 0 ? null : value.length === 1 ? kindName(value[0] as OrgActivityKind) : `${value.length} kinds`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Filter by kind"
          className="max-w-[280px]"
        >
          <FilterText label="Kind" value={label} fallback="any" />
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
                  <span className="flex-1 truncate">{kindName(kind)}</span>
                </PickerItem>
              );
            })}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  );
}

const kindName = (kind: OrgActivityKind) => {
  const label = ACTIVITY_LABELS[kind];
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function FilterText({ label, value, fallback }: { label: string; value: string | null; fallback: string }) {
  return (
    <>
      <span className="text-text-secondary">{label}</span>
      <span className={value ? 'min-w-0 truncate font-medium text-text' : 'text-text-secondary'}>
        {value ?? fallback}
      </span>
      <ChevronDown className="size-3 shrink-0 text-text-secondary" />
    </>
  );
}

function Detail({ parts }: { parts: DetailPart[] }) {
  return (
    <span className="truncate text-xs leading-4 text-text-secondary max-sm:whitespace-normal max-sm:break-words">
      <Parts parts={parts} code="text-2xs" />
    </span>
  );
}

function Parts({ parts, code }: { parts: DetailPart[]; code: string }) {
  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <code key={i} className={`font-mono ${code}`}>
            {part.code}
          </code>
        ),
      )}
    </>
  );
}
