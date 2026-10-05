'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { NotificationFacets } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { PageHeader } from '@components/page-header';
import { ReportMultiPicker, ReportPicker, type ReportOption } from '@components/reports/report-picker';
import { InboxEntry, InboxEntrySkeletons } from '@components/notifications/inbox-entry';
import { entryId, useInbox, useMarkRead, useNotificationFacets, useUnreadCount } from '@hooks/use-notifications';
import type { InboxFilter } from '@lib/api/notifications';
import { isApiError } from '@lib/api/errors';
import { AREA_LABELS, KIND_FILTERS, kindsOf, parseKindFilters } from '@lib/notifications/kinds';

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

  const onMark = (target: Parameters<typeof mark.mutate>[0]) =>
    mark.mutate(target, {
      onError: error => toast.error(isApiError(error) ? error.message : 'That could not be marked read. Try again.'),
    });

  const markAll = () =>
    mark.mutate(
      { how: 'all', filter },
      {
        onSuccess: result =>
          toast.success(
            result.marked === 0
              ? 'Nothing was unread.'
              : `Marked ${result.marked} ${result.marked === 1 ? 'notification' : 'notifications'} read.`,
          ),
        onError: error => toast.error(isApiError(error) ? error.message : 'Nothing was marked read. Try again.'),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inbox"
        meta={unread.data ? (unreadTotal === 0 ? 'Nothing unread' : `${unreadTotal} unread`) : undefined}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={nothingUnreadHere || mark.isPending}
            onClick={markAll}
            title={narrowed ? 'Marks everything that matches the filters' : undefined}
          >
            {narrowed ? 'Mark all matching read' : 'Mark all read'}
          </Button>
        }
      />

      <InboxFilters state={state} set={set} facets={facets.data} loading={facets.isPending} severalOrgs={severalOrgs} />

      {inbox.isPending ? (
        <InboxEntrySkeletons />
      ) : inbox.isError ? (
        <FormAlert title="Your inbox could not be loaded.">
          {isApiError(inbox.error) ? `${inbox.error.message} ` : 'The server did not answer. '}
          Nothing was marked read.{' '}
          <button type="button" className="font-medium underline" onClick={() => void inbox.refetch()}>
            Try again
          </button>
        </FormAlert>
      ) : entries.length === 0 ? (
        filtered ? (
          <FilteredEmpty state={state} set={set} facets={facets.data} severalOrgs={severalOrgs} />
        ) : (
          <EmptyState
            title="Nothing in your inbox."
            description="You hear here when someone assigns you an issue, mentions you, or comments on an issue you watch. A change arrives ten minutes after it is made."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={'/settings?tab=notifications' as Route}>Choose what you get by email</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {!filtered && unreadTotal === 0 ? (
            <p className="text-sm text-text-secondary">You are up to date: everything here has been read.</p>
          ) : null}
          <ul className="flex flex-col border-t">
            {entries.map(group => (
              <InboxEntry key={entryId(group)} group={group} showOrganization={severalOrgs} onMark={onMark} />
            ))}
          </ul>
          {inbox.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={inbox.isFetchingNextPage}
              onClick={() => void inbox.fetchNextPage()}
            >
              {inbox.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </>
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
  const kindOptions: ReportOption[] = KIND_FILTERS.map(f => ({
    value: f.value,
    label: f.label,
    group: AREA_LABELS[f.area],
  }));
  const projects = (facets?.projects ?? []).filter(p => !state.org || p.organization.slug === state.org);
  const projectOptions: ReportOption[] = [
    { value: '', label: 'All projects' },
    ...projects.map(p => ({
      value: projectValue(p.organization.slug, p.key),
      label: `${p.name} (${p.key})`,
      group: severalOrgs ? p.organization.name : undefined,
    })),
  ];
  const chosenProject = state.project && state.org ? projectValue(state.org, state.project) : '';
  const orgOptions: ReportOption[] = [
    { value: '', label: 'All organisations' },
    ...(facets?.organizations ?? []).map(o => ({ value: o.slug, label: o.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReportMultiPicker
        label="Kind"
        values={state.kinds}
        options={kindOptions}
        onChange={kinds => set({ kinds })}
        none="All"
        many={n => `${n} kinds`}
        clearLabel="Every kind"
      />
      <ReportPicker
        label="Project"
        value={chosenProject}
        options={projectOptions}
        fallback={state.project ?? 'All projects'}
        loading={loading}
        searchable={projects.length > 8}
        width="w-72"
        onChange={value => {
          if (!value) return set({ project: null, org: severalOrgs ? state.org : null });
          const [org, key] = value.split('/') as [string, string];
          set({ org, project: key });
        }}
      />
      {severalOrgs ? (
        <ReportPicker
          label="Organisation"
          value={state.org ?? ''}
          options={orgOptions}
          fallback={state.org ?? 'All organisations'}
          onChange={value => set({ org: value || null, project: value && value === state.org ? state.project : null })}
        />
      ) : null}
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
        <Button
          variant="ghost"
          size="xs"
          className="text-text-secondary"
          onClick={() => set({ kinds: [], project: null, org: null, unread: false })}
        >
          Clear filters
        </Button>
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
      description="Widen the filters, or clear them to see the whole inbox."
      action={
        <div className="flex flex-wrap gap-2">
          {state.kinds.length ? (
            <Button variant="outline" size="sm" onClick={() => set({ kinds: [] })}>
              Every kind
            </Button>
          ) : null}
          {state.project ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set({ project: null, org: severalOrgs ? state.org : null })}
            >
              Every project
            </Button>
          ) : state.org ? (
            <Button variant="outline" size="sm" onClick={() => set({ org: null })}>
              Every organisation
            </Button>
          ) : null}
          {state.unread ? (
            <Button variant="outline" size="sm" onClick={() => set({ unread: false })}>
              Include read
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => set({ kinds: [], project: null, org: null, unread: false })}>
            Clear filters
          </Button>
        </div>
      }
    />
  );
}
