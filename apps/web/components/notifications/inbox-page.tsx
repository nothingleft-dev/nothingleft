'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { NotificationFacets } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { PageHeader } from '@components/page-header';
import { ReportMultiPicker, ReportPicker, type ReportOption } from '@components/reports/report-picker';
import { InboxEntry, InboxEntrySkeletons, subjectName, type EntryTarget } from '@components/notifications/inbox-entry';
import { entryId, useInbox, useMarkRead, useNotificationFacets, useUnreadCount } from '@hooks/use-notifications';
import type { InboxFilter } from '@lib/api/notifications';
import { ProjectMark } from '@components/projects/project-mark';
import { useOrganizations } from '@hooks/use-organizations';
import { AREA_LABELS, KIND_FILTERS, kindsOf, parseKindFilters } from '@lib/notifications/kinds';
import { toastError } from '@components/toast-error';
import { plural } from '@lib/numbers';
import { LoadMore } from '@components/text-button';
import { cn } from '@lib/utils';

interface InboxState {
  kinds: string[];
  project: string | null;
  org: string | null;
  unread: boolean;
}

function useInboxState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state: InboxState = {
    kinds: parseKindFilters(params.get('kind')),
    project: params.get('project'),
    org: params.get('org'),
    unread: params.get('unread') === '1',
  };
  const set = (next: Partial<InboxState>) => {
    const merged = { ...state, ...next };
    const search = new URLSearchParams();
    if (merged.kinds.length) search.set('kind', merged.kinds.join(','));
    if (merged.org) search.set('org', merged.org);
    if (merged.project) search.set('project', merged.project);
    if (merged.unread) search.set('unread', '1');
    const query = search.toString().replaceAll('%2C', ',');
    router.replace(`${pathname}${query ? `?${query}` : ''}` as Route, { scroll: false });
  };
  return { state, set };
}

const toFilter = (state: InboxState): InboxFilter => ({
  kind: state.kinds.length ? kindsOf(state.kinds) : undefined,
  project: state.project ?? undefined,
  org: state.org ?? undefined,
  unread: state.unread || undefined,
});

const projectValue = (org: string, key: string) => `${org}/${key}`;

export function InboxPage() {
  const { state, set } = useInboxState();
  const filter = toFilter(state);
  const inbox = useInbox(filter);
  const unread = useUnreadCount();
  const facets = useNotificationFacets();
  const mark = useMarkRead();
  const organizations = facets.data?.organizations ?? [];
  const severalOrgs = organizations.length > 1;
  const narrowed = state.kinds.length > 0 || state.project !== null || state.org !== null;
  const filtered = narrowed || state.unread;

  const entries = inbox.data?.pages.flatMap(p => p.data) ?? [];
  const unreadTotal = unread.data?.count ?? 0;
  const nothingUnreadHere = narrowed
    ? inbox.isSuccess && !inbox.hasNextPage && entries.every(e => e.unread_count === 0)
    : unreadTotal === 0;
  const emptyInbox = !filtered && inbox.isSuccess && entries.length === 0;

  const unreadMeta = () => {
    if (!unread.data || inbox.isError || emptyInbox) return undefined;
    if (unreadTotal === 0) return 'Nothing unread';
    if (!narrowed)
      return severalOrgs
        ? `${unreadTotal} unread across ${organizations.length} organisations`
        : `${unreadTotal} unread`;
    const orgOnly = state.org !== null && state.project === null && state.kinds.length === 0;
    const matching = orgOnly
      ? (unread.data.organizations.find(o => o.slug === state.org)?.count ?? 0)
      : inbox.isSuccess && !inbox.hasNextPage
        ? entries.filter(e => e.unread_count > 0).length
        : null;
    return matching === null ? undefined : `${matching} of ${unreadTotal} unread`;
  };

  const onMark = (target: EntryTarget) =>
    mark.mutate(target, {
      onError: error =>
        toastError(`Could not mark ${subjectName(target.group)} read`, error, { retry: () => onMark(target) }),
    });

  const markAll = () =>
    mark.mutate(
      { how: 'all', filter },
      {
        onSuccess: result =>
          toast.success(
            result.marked === 0 ? 'Nothing was unread.' : `Marked ${plural(result.marked, 'notification')} read.`,
          ),
        onError: error => toastError('Could not mark everything read', error, { retry: markAll }),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inbox"
        meta={unreadMeta()}
        actions={
          emptyInbox ? undefined : (
            <Button
              variant="outline"
              size="sm"
              disabled={nothingUnreadHere || inbox.isError || mark.isPending}
              onClick={markAll}
              title={narrowed ? 'Marks everything that matches the filters' : undefined}
            >
              {/* Both labels share one cell, so the button keeps its width when a filter changes it. */}
              <span className="grid justify-items-center">
                <span className="col-start-1 row-start-1">{narrowed ? 'Mark matching read' : 'Mark all read'}</span>
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {narrowed ? 'Mark all read' : 'Mark matching read'}
                </span>
              </span>
            </Button>
          )
        }
      />

      {emptyInbox ? null : (
        <InboxFilters
          state={state}
          set={set}
          facets={facets.data}
          loading={facets.isPending}
          severalOrgs={severalOrgs}
        />
      )}

      {inbox.isPending ? (
        <InboxEntrySkeletons />
      ) : inbox.isError ? (
        <LoadError onRetry={() => void inbox.refetch()} detail={errorDetail(inbox.error)}>
          Your inbox could not be loaded.
        </LoadError>
      ) : entries.length === 0 ? (
        filtered ? (
          <FilteredEmpty state={state} set={set} facets={facets.data} severalOrgs={severalOrgs} />
        ) : (
          <EmptyState
            title="Nothing in your inbox."
            description="Assignments, mentions, comments, sprints and articles that concern you arrive here. Changes to issues wait ten minutes first, in case they are undone."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={'/settings?tab=notifications' as Route}>Notification settings</Link>
              </Button>
            }
          />
        )
      ) : (
        <div>
          <ul className="flex flex-col border-t">
            {entries.map(group => (
              <InboxEntry key={entryId(group)} group={group} showOrganization={severalOrgs} onMark={onMark} />
            ))}
          </ul>
          {inbox.isFetchingNextPage ? <InboxEntrySkeletons rows={3} more /> : null}
          {inbox.hasNextPage ? (
            <LoadMore
              pending={inbox.isFetchingNextPage}
              pendingLabel="Load more"
              onClick={() => void inbox.fetchNextPage()}
              className="mt-4"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function InboxFilters({
  state,
  set,
  facets,
  loading,
  severalOrgs,
}: {
  state: InboxState;
  set: (next: Partial<InboxState>) => void;
  facets: NotificationFacets | undefined;
  loading: boolean;
  severalOrgs: boolean;
}) {
  // The development kinds wait for a project with a linked repository (plan § 14).
  const organizations = useOrganizations();
  const gitEnabled = organizations.data?.some(o => o.git_enabled) ?? false;
  const kindOptions: ReportOption[] = KIND_FILTERS.filter(
    f => f.area !== 'development' || gitEnabled || state.kinds.includes(f.value),
  ).map(f => ({
    value: f.value,
    label: f.label,
    group: AREA_LABELS[f.area],
  }));
  const projects = (facets?.projects ?? []).filter(p => !state.org || p.organization.slug === state.org);
  const projectOptions: ReportOption[] = [
    { value: '', label: 'All' },
    ...projects.map(p => ({
      value: projectValue(p.organization.slug, p.key),
      label: p.name,
      hint: p.key,
      group: severalOrgs ? p.organization.name : undefined,
      mark: <ProjectMark project={p} size="xs" />,
    })),
  ];
  const chosenProject = state.project && state.org ? projectValue(state.org, state.project) : '';
  const orgOptions: ReportOption[] = [
    { value: '', label: 'All' },
    ...(facets?.organizations ?? []).map(o => ({ value: o.slug, label: o.name })),
  ];

  // A chosen project or organisation reads its slug until the facets name it; the longer name can wrap the row.
  const naming = loading && (state.project !== null || state.org !== null);
  return (
    <div className={cn('flex flex-wrap items-center gap-2', naming && 'invisible')}>
      {severalOrgs ? (
        <ReportPicker
          label="Organisation"
          value={state.org ?? ''}
          options={orgOptions}
          fallback={state.org ?? 'All'}
          onChange={value => set({ org: value || null, project: value && value === state.org ? state.project : null })}
        />
      ) : null}
      <ReportPicker
        label="Project"
        value={chosenProject}
        options={projectOptions}
        fallback={state.project ?? 'All'}
        loading={loading}
        searchable={projects.length > 8}
        width="w-72"
        onChange={value => {
          if (!value) return set({ project: null, org: severalOrgs ? state.org : null });
          const [org, key] = value.split('/') as [string, string];
          set({ org, project: key });
        }}
      />
      <ReportMultiPicker
        label="Kind"
        values={state.kinds}
        options={kindOptions}
        onChange={kinds => set({ kinds })}
        none="All"
        many={n => `${n} kinds`}
        clearLabel="All"
      />
      <ReportPicker
        label="Show"
        value={state.unread ? 'unread' : 'all'}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread only' },
        ]}
        width="w-44"
        onChange={value => set({ unread: value === 'unread' })}
      />
      {state.kinds.length || state.project || state.org || state.unread ? (
        // A plain button: the phone rule that lifts every Button to 44 px would leave it taller than the pickers.
        <button
          type="button"
          className="inline-flex h-6 items-center rounded-md px-2 text-xs text-text-secondary hover:bg-hover hover:text-text"
          onClick={() => set({ kinds: [], project: null, org: null, unread: false })}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function FilteredEmpty({
  state,
  set,
  facets,
  severalOrgs,
}: {
  state: InboxState;
  set: (next: Partial<InboxState>) => void;
  facets: NotificationFacets | undefined;
  severalOrgs: boolean;
}) {
  const kindText = KIND_FILTERS.filter(f => state.kinds.includes(f.value))
    .map(f => f.label.toLowerCase())
    .join(' or ');
  const project = facets?.projects.find(p => p.key === state.project && p.organization.slug === state.org);
  const org = facets?.organizations.find(o => o.slug === state.org);
  const where = project ? ` in ${project.name}` : org ? ` in ${org.name}` : '';

  if (state.unread && state.kinds.length === 0 && !state.project && (!state.org || !severalOrgs)) {
    return (
      <EmptyState
        title="Nothing unread."
        description="Everything in your inbox has been read."
        action={
          <Button variant="outline" size="sm" onClick={() => set({ unread: false })}>
            Show read notifications
          </Button>
        }
      />
    );
  }

  const title = `No ${state.unread ? 'unread ' : ''}${kindText ? `notifications for ${kindText}` : 'notifications'}${where}.`;
  return (
    <EmptyState
      title={title}
      description="Drop a filter to see more."
      action={
        <div className="flex flex-wrap gap-2">
          {state.org && !state.project ? (
            <Button variant="outline" size="sm" onClick={() => set({ org: null })}>
              All organisations
            </Button>
          ) : null}
          {state.project ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set({ project: null, org: severalOrgs ? state.org : null })}
            >
              All projects
            </Button>
          ) : null}
          {state.kinds.length ? (
            <Button variant="outline" size="sm" onClick={() => set({ kinds: [] })}>
              All kinds
            </Button>
          ) : null}
          {state.unread ? (
            <Button variant="outline" size="sm" onClick={() => set({ unread: false })}>
              Include read
            </Button>
          ) : null}
        </div>
      }
    />
  );
}
