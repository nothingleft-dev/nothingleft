'use client';

import { ArchivedNotice } from '@components/projects/archived-notice';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { IssueListItem, SavedView } from '@nothingleft/types';
import { LoadError, StaleNotice, errorDetail, notFoundOn404 } from '@components/query-state';
import { Button } from '@components/ui/button';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { Kbd } from '@components/kbd';
import { PageTitle } from '@components/page-title';
import { BulkBar } from '@components/issues/list/bulk-bar';
import { IssueTable, IssueTableSkeleton } from '@components/issues/list/issue-table';
import { useListUrlState } from '@components/issues/list/list-state';
import { ListToolbar } from '@components/issues/list/list-toolbar';
import { QueryBar, type QueryProblem } from '@components/issues/list/query-bar';
import { SaveViewDialog } from '@components/issues/list/save-view-dialog';
import { ViewTabs, type ViewAction } from '@components/issues/list/view-tabs';
import { FirstProjectEmptyState } from '@components/projects/first-project-empty-state';
import { useIssueSearch, useIssuesCsvExport, useUpdateListedIssue } from '@hooks/use-issue-search';
import { useProject } from '@hooks/use-projects';
import { useProjectRoles } from '@hooks/use-project-roles';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { useDeleteSavedView, useSavedViews, useUpdateSavedView } from '@hooks/use-saved-views';
import { useSession } from '@hooks/use-session';
import { useVisibleColumns } from '@hooks/use-visible-columns';
import { isApiError } from '@lib/api/errors';
import { columnDefs, csvColumnsFor, shownColumns } from '@lib/issue-list/columns';
import { isGroupable } from '@components/custom-fields/field-types';
import { useCustomColumns } from '@hooks/use-custom-columns';
import { todayCalendarDate } from '@lib/datetime';
import { toastError } from '@components/toast-error';
import { viewReference, viewSortText as sortText } from '@lib/issue-list/saved-views';

interface IssueListProps {
  /** Scope every request to one project. */
  project?: string;
  /** An unseen query ANDed in front of the bar: `assignee: me #Unresolved` on /my-issues. */
  base?: string;
  title?: string;
  /** Saved-view tabs belong on the issue lists, not the fixed ones. */
  views?: boolean;
  /** What a fixed list says when its base query finds nothing and nothing is typed. */
  empty?: { title: string; description: string };
}

export function IssueList({ project, base = '', title, views: withViews = true, empty }: IssueListProps) {
  const { state, navigate, wantsFocus } = useListUrlState();
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const today = todayCalendarDate(timeZone);
  const roles = useProjectRoles();
  const { openCreateIssue } = useCreateIssueDialog();
  const projectQuery = useProject(project ?? null);
  useRecordProjectVisit(project ?? null);
  notFoundOn404(projectQuery.error);

  const savedViews = useSavedViews(withViews);
  const views = useMemo(
    () => (savedViews.data ?? []).filter(v => !project || v.project === null || v.project.key === project),
    [savedViews.data, project],
  );
  const activeView = state.view ? (views.find(v => v.name.toLowerCase() === state.view!.toLowerCase()) ?? null) : null;
  const modified = activeView !== null && (activeView.query !== state.q || sortText(activeView) !== state.sort);

  const fullQuery = [base, state.q].filter(Boolean).join(' ');
  const groupBy = state.group === 'none' ? undefined : state.group;
  const search = useIssueSearch({ q: fullQuery, project, group_by: groupBy, sort: state.sort });

  const { columns, setColumns, fromView } = useVisibleColumns(activeView?.columns ?? null);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState<'new' | 'edit' | null>(null);
  const [deleting, setDeleting] = useState<SavedView | null>(null);
  const update = useUpdateListedIssue();
  const updateView = useUpdateSavedView();
  const deleteView = useDeleteSavedView();
  const exporter = useIssuesCsvExport();

  const problem = useMemo<QueryProblem | null>(() => {
    const error = search.error;
    if (!error || !isApiError(error) || error.status !== 400) return null;
    const offset = base ? base.length + 1 : 0;
    const span =
      error.field === 'q' && error.span && error.span.start >= offset
        ? { start: error.span.start - offset, end: error.span.end - offset }
        : null;
    return { message: error.message, span, validValues: error.validValues ?? [] };
  }, [search.error, base]);

  // While a query is invalid, the last list that ran stays under it, dimmed and out of reach.
  const [lastGood, setLastGood] = useState(search.data);
  if (search.data && search.data !== lastGood) setLastGood(search.data);
  const frozen = problem !== null && !search.data && lastGood !== undefined;
  const data = search.data ?? (frozen ? lastGood : undefined);

  const rows = useMemo(() => data?.pages.flatMap(p => p.data) ?? [], [data]);
  const first = data?.pages[0];
  const total = frozen ? null : (first?.meta.pagination?.total ?? null);
  const groups = first?.meta.groups;

  const selectedRows = useMemo(() => rows.filter(r => selection.has(r.key)), [rows, selection]);
  const customColumns = useCustomColumns(project, rows);
  const gitEnabled = useMemo(() => rows.some(r => r.project.git_enabled), [rows]);
  const defs = useMemo(() => columnDefs(customColumns, gitEnabled), [customColumns, gitEnabled]);
  const shown = useMemo(() => shownColumns(columns, defs), [columns, defs]);
  const groupFields = useMemo(() => customColumns.filter(c => isGroupable(c.type)), [customColumns]);

  const commit = (q: string) => {
    // Typing past the view's query leaves the tab; the URL still mirrors what runs.
    const keepView = activeView && q === activeView.query ? state.view : null;
    navigate({ q, view: keepView });
    setSelection(new Set());
  };

  const selectView = (view: SavedView) => {
    navigate({ q: view.query, view: view.name, sort: sortText(view) });
    setSelection(new Set());
  };

  const onViewAction = (view: SavedView, action: ViewAction) => {
    if (action === 'rename') setSaving('edit');
    if (action === 'delete') setDeleting(view);
    if (action === 'update') {
      updateView.mutate(
        { name: view.name, body: { query: state.q, sort: state.sort || null, columns: [...columns] } },
        {
          onSuccess: v => toast.success(`Saved the current query to ${v.name}.`),
          onError: e => toastError(`Could not save ${view.name}`, e),
        },
      );
    }
  };

  const onUpdate = (
    key: string,
    body: Parameters<typeof update.mutate>[0]['body'],
    optimistic: (i: IssueListItem) => IssueListItem,
  ): void =>
    update.mutate(
      { key, body, optimistic },
      {
        onError: error => {
          // Someone else changed the issue: sending the same change again would be refused again.
          if (isApiError(error) && error.status === 409) {
            toast.error(`Could not update ${key}`, {
              description: `${key} changed since the list loaded.`,
              action: { label: 'Reload', onClick: () => void search.refetch() },
            });
            return;
          }
          toastError(`Could not update ${key}`, error, { retry: () => onUpdate(key, body, optimistic) });
        },
      },
    );

  const exportCsv = (): void =>
    exporter.mutate(
      { q: fullQuery, project, sort: state.sort, columns: csvColumnsFor(columns, defs) },
      { onError: error => toastError('Could not export the issues', error, { retry: exportCsv }) },
    );

  const projectEmpty = project !== undefined && projectQuery.data && total === 0 && fullQuery === '';
  const loading = search.isPending && !search.data;
  const hasTabs = withViews && views.length > 0;
  const table = (
    <IssueTable
      rows={rows}
      groups={groups}
      groupBy={groupBy ?? null}
      columns={shown}
      total={total ?? rows.length}
      hasMore={!frozen && search.hasNextPage}
      loadingMore={search.isFetchingNextPage}
      onLoadMore={() => void search.fetchNextPage()}
      stale={search.isPlaceholderData}
      selection={selection}
      onSelectionChange={setSelection}
      canEdit={roles.canEdit}
      onUpdate={onUpdate}
      sort={state.sort}
      onSort={sort => navigate({ sort }, 'replace')}
      today={today}
      timeZone={timeZone}
    />
  );
  const scopeName = project ? (projectQuery.data?.name ?? project) : 'your projects';

  return (
    <div className="flex flex-col gap-4">
      {title ? <PageTitle>{title}</PageTitle> : null}
      {projectQuery.data?.is_archived ? (
        <ArchivedNotice>
          {projectQuery.data.name} is archived, so its issues are read-only. A Project Admin can restore it from the
          project’s settings.
        </ArchivedNotice>
      ) : null}

      <QueryBar
        value={state.q}
        onCommit={commit}
        problem={problem}
        base={base}
        autoFocus={wantsFocus}
        onSaveView={withViews && !projectEmpty ? () => setSaving('new') : undefined}
        saveLabel={activeView && modified && activeView.can_edit ? 'Save as new view' : 'Save view'}
      />

      {projectEmpty ? null : (
        <ListToolbar
          controls={!frozen && (loading || rows.length > 0)}
          tabs={
            hasTabs ? (
              <ViewTabs
                views={views}
                active={activeView}
                project={project}
                onSelect={selectView}
                onAction={onViewAction}
                modified={modified}
              />
            ) : null
          }
          total={total}
          loading={loading}
          group={state.group}
          onGroup={group => navigate({ group }, 'replace')}
          columns={columns}
          onColumns={setColumns}
          columnsFromView={fromView}
          columnDefs={defs}
          groupFields={groupFields}
          onExport={exportCsv}
          exporting={exporter.isPending}
          importHref={project && roles.canAdmin(project) ? `/projects/${project}/import` : undefined}
        />
      )}

      {search.isError && !problem && search.data ? (
        <StaleNotice onRetry={() => void search.refetch()}>
          The list could not be refreshed. It shows what loaded last.
        </StaleNotice>
      ) : null}

      {loading ? (
        <IssueTableSkeleton columns={shown} grouped={groupBy !== undefined} />
      ) : search.isError && !problem && !search.data ? (
        <LoadError onRetry={() => void search.refetch()} detail={errorDetail(search.error)}>
          The list could not be loaded.
        </LoadError>
      ) : problem && !search.data ? (
        frozen ? (
          <div inert className="opacity-50">
            {table}
          </div>
        ) : null
      ) : projectEmpty ? (
        <FirstProjectEmptyState
          projectKey={project}
          projectName={projectQuery.data.name}
          canCreate={roles.canEdit(project)}
          canImport={roles.canAdmin(project)}
        />
      ) : total === 0 && empty && !state.q ? (
        <EmptyState title={empty.title} description={empty.description} />
      ) : total === 0 ? (
        <EmptyState
          title={fullQuery ? 'No issues match this search.' : 'No issues yet.'}
          description={
            fullQuery
              ? `Nothing in ${scopeName} matches “${state.q || base}”. Widen the search or clear it.`
              : roles.writable.length > 0
                ? 'Issues you and your team create in your projects appear here.'
                : 'Issues people create in your projects will appear here.'
          }
          action={
            state.q ? (
              <Button variant="outline" size="sm" onClick={() => commit('')}>
                Clear the search
              </Button>
            ) : roles.writable.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => openCreateIssue(project && roles.canEdit(project) ? { project } : undefined)}
              >
                Create issue <Kbd className="h-4 max-md:hidden">c</Kbd>
              </Button>
            ) : undefined
          }
        />
      ) : (
        table
      )}

      <BulkBar
        selected={selectedRows}
        onClear={() => setSelection(new Set())}
        onKeepFailed={keys => setSelection(new Set(keys))}
      />

      <SaveViewDialog
        open={saving !== null}
        onOpenChange={open => setSaving(open ? (saving ?? 'new') : null)}
        query={state.q}
        sort={state.sort}
        columns={columns}
        project={project}
        existing={saving === 'edit' ? activeView : null}
        onSaved={view => navigate({ q: view.query, view: view.name, sort: sortText(view) }, 'replace')}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => (open ? null : setDeleting(null))}
        title={`Delete the view “${deleting?.name ?? ''}”?`}
        confirmLabel="Delete view"
        pendingLabel="Deleting…"
        pending={deleteView.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteView.mutate(deleting.name, {
            onSuccess: v => {
              toast.success(`Deleted the view ${v.name}.`);
              setDeleting(null);
              navigate({ view: null }, 'replace');
            },
            onError: e => toastError(`Could not delete ${deleting.name}`, e),
          });
        }}
      >
        <p>
          {deleting?.visibility === 'private'
            ? 'Only you could see it.'
            : deleting?.visibility === 'project'
              ? `Everyone in ${deleting.project?.name ?? 'the project'} loses this tab.`
              : 'Everyone in the organisation loses this tab.'}{' '}
          Any search that still names it as{' '}
          <code className="font-mono [font-variant-ligatures:none]">{viewReference(deleting?.name ?? '')}</code> will
          report it as unknown.
        </p>
      </ConfirmDialog>
    </div>
  );
}
