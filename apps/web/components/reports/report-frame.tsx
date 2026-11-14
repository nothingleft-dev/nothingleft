'use client';

import type { ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReportEmpty } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { EmptyState } from '@components/empty-state';
import { PageHeader } from '@components/page-header';
import { QueryBar, type QueryProblem } from '@components/issues/list/query-bar';
import { DEFAULT_PERIOD } from '@components/reports/period-picker';
import type { ReportState } from '@components/reports/report-state';
import {
  ReportEmptyState,
  ReportFailure,
  ReportProblem,
  ReportSkeleton,
  SUGGESTION,
  WIDER_PERIODS,
  type SkeletonShape,
} from '@components/reports/report-states';
import { ProjectsPicker, ViewPicker } from '@components/reports/scope-pickers';
import { useReportCsvExport } from '@hooks/use-reports';
import { isApiError } from '@lib/api/errors';
import { formatDateTimeWithZone, formatTime } from '@lib/datetime';
import { reportDef } from '@lib/reports/registry';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

const PERIOD_PROBLEMS = new Set([
  'report.invalid_period',
  'report.period_incomplete',
  'report.period_out_of_order',
  'report.period_too_long',
]);

interface FramedReport {
  empty: ReportEmpty | null;
  generated_at: string;
}

interface ReportFrameProps<D extends FramedReport> {
  state: ReportState;
  result: UseQueryResult<D>;
  /** Which scope controls apply: the query bar, the saved view and the projects. */
  scope: { query: boolean; projects: boolean; project?: string };
  controls?: ReactNode;
  display?: ReactNode;
  skeleton: SkeletonShape;
  summary?: (data: D) => ReactNode;
  /** The Gantt draws its own empty state, because its missing-dates list still shows. */
  ownEmpty?: boolean;
  emptyAction?: (data: D) => ReactNode;
  /** A valid value picked from a 400: most set their own parameter; a sprint name needs its project. */
  pickValue?: (field: string, value: string) => void;
  /** The periods offered to widen an empty report or to replace one the API refused. */
  widerPeriods?: readonly string[];
  children: (data: D) => ReactNode;
}

export function ReportFrame<D extends FramedReport>({
  state,
  result,
  scope,
  controls,
  display,
  skeleton,
  summary,
  ownEmpty,
  emptyAction,
  pickValue,
  widerPeriods = WIDER_PERIODS,
  children,
}: ReportFrameProps<D>) {
  const def = reportDef(state.name);
  const exporter = useReportCsvExport();
  const data = result.data;
  const error = isApiError(result.error) ? result.error : null;

  const queryProblem: QueryProblem | null =
    error?.status === 400 && error.field === 'q'
      ? { message: error.message, span: error.span ?? null, validValues: error.validValues ?? [] }
      : null;
  const paramProblem = error && !queryProblem && (error.status === 400 || error.status === 404) ? error : null;
  const failure = result.error && !queryProblem && !paramProblem ? result.error : null;

  const periodProblem = paramProblem ? PERIOD_PROBLEMS.has(paramProblem.code) : false;
  const currentPeriod = state.params.get('from') ? null : (state.params.get('period') ?? DEFAULT_PERIOD);
  const periodFixes = [DEFAULT_PERIOD, ...widerPeriods].filter(
    (p, i, all) => all.indexOf(p) === i && p !== currentPeriod,
  );

  const pick = (field: string, value: string) => (pickValue ? pickValue(field, value) : state.set({ [field]: value }));

  const exportCsv = (): void =>
    exporter.mutate(
      { name: state.name, query: state.query },
      { onError: e => toastError('Could not export the report', e, { retry: exportCsv }) },
    );

  // The Gantt's CSV still lists the issues missing dates when there is nothing to draw.
  const canExport = Boolean(data && (!data.empty || ownEmpty)) && !result.isError;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={def.title}
        meta={
          data ? (
            <span className="inline-flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs">Updated {formatTime(data.generated_at)}</span>
                </TooltipTrigger>
                <TooltipContent>
                  Figures as of {formatDateTimeWithZone(data.generated_at)}. Any change since is picked up on refresh.
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Refresh the figures"
                title="Refresh the figures"
                disabled={result.isFetching}
                onClick={() => void result.refetch()}
              >
                <RefreshCw className={cn('size-3.5', result.isFetching && 'animate-spin')} />
              </Button>
            </span>
          ) : null
        }
        actions={
          <PendingButton
            variant="outline"
            size="xs"
            onClick={exportCsv}
            disabled={!canExport}
            pending={exporter.isPending}
            pendingLabel={
              <>
                <Download className="size-3.5 animate-pulse" />
                <span className="max-sm:sr-only">Preparing the file…</span>
              </>
            }
          >
            <Download className="size-3.5" />
            <span className="max-sm:sr-only">Export CSV</span>
          </PendingButton>
        }
      />

      {scope.query ? (
        <QueryBar
          value={state.get('q')}
          onCommit={q => state.set({ q: q || null }, 'push')}
          problem={queryProblem}
          placeholder="Narrow the report · type: Bug #Unresolved"
          label="Report scope"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {scope.query ? (
          <ViewPicker value={state.get('view')} project={scope.project} onChange={view => state.set({ view })} />
        ) : null}
        {scope.projects ? (
          <ProjectsPicker value={state.get('projects')} onChange={projects => state.set({ projects })} />
        ) : null}
        {controls}
        {display ? <div className="ml-auto flex items-center gap-2 max-sm:ml-0">{display}</div> : null}
      </div>

      {paramProblem ? (
        <ReportProblem
          message={paramProblem.message}
          validValues={paramProblem.field ? (paramProblem.validValues ?? []) : []}
          onPick={paramProblem.field ? v => pick(paramProblem.field!, v) : undefined}
          formatValue={paramProblem.field === 'users' ? v => `@${v}` : undefined}
          fixes={
            periodProblem
              ? periodFixes.map(p => (
                  <Button
                    key={p}
                    variant="outline"
                    size="xs"
                    className={SUGGESTION}
                    onClick={() => state.set({ period: p === DEFAULT_PERIOD ? null : p, from: null, to: null })}
                  >
                    Use {p.toLowerCase()}
                  </Button>
                ))
              : undefined
          }
        />
      ) : null}
      {paramProblem?.status === 404 && scope.projects ? (
        <div>
          <Button variant="outline" size="xs" onClick={() => state.set({ projects: null })}>
            Every project
          </Button>
        </div>
      ) : null}

      {queryProblem ? (
        <EmptyState title="Fix the query to see the report." />
      ) : failure ? (
        <ReportFailure message={failure.message} onRetry={() => void result.refetch()} />
      ) : result.isPending ? (
        <ReportSkeleton shape={skeleton} />
      ) : data && !result.isError ? (
        <div className={cn('flex flex-col gap-4', result.isPlaceholderData && 'is-stale')}>
          {summary && !data.empty ? <div className="text-xs text-text-secondary">{summary(data)}</div> : null}
          {data.empty && !ownEmpty ? (
            <ReportEmptyState
              empty={data.empty}
              period={state.params.get('from') ? null : (state.params.get('period') ?? DEFAULT_PERIOD)}
              onChange={changes => state.set(changes, 'push')}
              action={emptyAction?.(data)}
              widerPeriods={widerPeriods}
            />
          ) : (
            children(data)
          )}
        </div>
      ) : null}
    </div>
  );
}
