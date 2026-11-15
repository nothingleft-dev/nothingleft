'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { AutomationRun } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@components/ui/sheet';
import { EmptyState } from '@components/empty-state';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { TextButton } from '@components/text-button';
import { HueChip } from '@components/git/git-marks';
import { StatusDot } from '@components/issues/value-marks';
import { useAutomationRuns } from '@hooks/use-automations';
import { useSchemaValues } from '@hooks/use-project-schema';
import { RUN_RESULT, SKIP_REASON } from '@lib/git/words';
import { formatCount } from '@lib/numbers';
import { cn } from '@lib/utils';

const PAGE = 50;

export interface RunsTarget {
  automation: string | null;
  issue: string | null;
}

interface RunsDrawerProps {
  projectKey: string;
  target: RunsTarget | null;
  onClose: () => void;
}

export function RunsDrawer({ projectKey, target, onClose }: RunsDrawerProps) {
  return (
    <Sheet open={target !== null} onOpenChange={open => (open ? null : onClose())}>
      <SheetContent
        className="w-full gap-0 sm:max-w-4xl"
        onOpenAutoFocus={event => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
        }}
      >
        {target ? <Runs projectKey={projectKey} target={target} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Runs({ projectKey, target }: { projectKey: string; target: RunsTarget }) {
  const [offset, setOffset] = useState(0);
  const runs = useAutomationRuns(projectKey, {
    ...(target.automation ? { automation: target.automation } : {}),
    ...(target.issue ? { issue: target.issue } : {}),
    limit: PAGE,
    offset,
  });
  const rows = runs.data?.data ?? [];
  const total = runs.data?.meta.pagination?.total ?? rows.length;
  const scope = [target.automation, target.issue].filter(Boolean).join(' on ');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>{target.automation ? `Runs of “${target.automation}”` : 'Automation runs'}</SheetTitle>
        <SheetDescription>
          Every time {scope ? `${scope}` : 'a rule of this project'} looked at an issue in the last 90 days: what it
          changed, or why it left the issue alone.
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {runs.isPending ? (
          <RunsSkeleton withRule={!target.automation} />
        ) : runs.isError && !runs.data ? (
          <div className="p-5">
            <LoadError onRetry={() => void runs.refetch()} detail={errorDetail(runs.error)}>
              The runs could not be loaded.
            </LoadError>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No runs in the last 90 days."
              description="A rule runs when its trigger fires on an issue of this project: a branch, a pull request, a merge."
            />
          </div>
        ) : (
          <div className="text-sm">
            <div
              aria-hidden
              className={cn(
                rowGrid(!target.automation),
                'sticky top-0 z-10 h-7 items-center bg-app text-2xs font-medium text-text-secondary max-sm:hidden',
              )}
            >
              <span>When</span>
              <span>Issue</span>
              {target.automation ? null : <span>Rule</span>}
              <span>What happened</span>
            </div>
            <ul className="divide-y divide-border-subtle">
              {rows.map(run => (
                <RunRow key={run.id} projectKey={projectKey} run={run} withRule={!target.automation} />
              ))}
            </ul>
          </div>
        )}
      </div>
      {total > PAGE ? (
        <div className="flex items-center gap-2 border-t px-5 py-2.5 text-xs text-text-secondary">
          {formatCount(offset + 1)}–{formatCount(Math.min(offset + PAGE, total))} of {formatCount(total)}
          <Button
            variant="outline"
            size="xs"
            className="ml-auto"
            disabled={offset === 0}
            onClick={() => setOffset(offset - PAGE)}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Older
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function changeOf(run: AutomationRun): { from: string; to: string } | null {
  const status = run.changes?.status as { from?: unknown; to?: unknown } | undefined;
  return status && typeof status.to === 'string' ? { from: String(status.from ?? ''), to: status.to } : null;
}

function rowGrid(withRule: boolean) {
  return cn(
    'grid gap-x-4 gap-y-1 px-5',
    withRule ? 'sm:grid-cols-[6.5rem_4.5rem_13rem_minmax(0,1fr)]' : 'sm:grid-cols-[6.5rem_4.5rem_minmax(0,1fr)]',
  );
}

function StatusName({ projectKey, name }: { projectKey: string; name: string }) {
  const statuses = useSchemaValues(projectKey, 'statuses');
  const status = statuses.data?.find(s => s.name.toLowerCase() === name.toLowerCase());
  return (
    <span className="inline-flex items-center gap-1.5">
      {status ? <StatusDot category={status.category} color={status.color} /> : null}
      {name}
    </span>
  );
}

function RunRow({ projectKey, run, withRule }: { projectKey: string; run: AutomationRun; withRule: boolean }) {
  const { label, hue } = RUN_RESULT[run.result];
  const change = changeOf(run);
  const note = change ? null : run.reason ? SKIP_REASON[run.reason] : run.result === 'failed' ? FAILED_NOTE : null;
  const key = (
    <Link
      href={`/issue/${run.issue}` as Route}
      className="font-mono text-xs text-text underline-offset-3 hover:underline"
    >
      {run.issue}
    </Link>
  );
  return (
    <li className={cn(rowGrid(withRule), 'py-2.5 text-xs leading-5')}>
      <RelativeTime value={run.created_at} className="whitespace-nowrap text-text-secondary tabular max-sm:hidden" />
      <span className="max-sm:hidden">{key}</span>
      <span className="flex items-center gap-1.5 text-text-secondary sm:hidden">
        {key} · <RelativeTime value={run.created_at} className="tabular" />
      </span>
      {withRule ? (
        <span className="line-clamp-2" title={run.automation}>
          {run.automation}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col gap-1 max-sm:pt-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <HueChip hue={hue}>{label}</HueChip>
          {change ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 text-text">
              <StatusName projectKey={projectKey} name={change.from} />
              <span aria-label="to" className="text-text-muted">
                →
              </span>
              <b className="font-medium">
                <StatusName projectKey={projectKey} name={change.to} />
              </b>
            </span>
          ) : note ? (
            <span className="text-text-secondary">{note}</span>
          ) : null}
        </span>
        <span className="text-text-secondary">
          <Cause text={run.cause} />
        </span>
      </span>
    </li>
  );
}

const FAILED_NOTE = 'the status change did not save, so nothing moved';

function Cause({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <span className="flex flex-col items-start gap-1">
      <span ref={ref} className={open ? '[overflow-wrap:anywhere]' : 'line-clamp-2 [overflow-wrap:anywhere]'}>
        {text}
      </span>
      {clamped ? (
        <TextButton aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {open ? 'Show less' : 'Show all'}
        </TextButton>
      ) : null}
    </span>
  );
}

function RunsSkeleton({ withRule }: { withRule: boolean }) {
  return (
    <div role="status" aria-label="Loading runs">
      <div className={cn(rowGrid(withRule), 'h-7 items-center bg-app max-sm:hidden')}>
        <Skeleton className="h-2.5 w-10" />
        <Skeleton className="h-2.5 w-10" />
        {withRule ? <Skeleton className="h-2.5 w-10" /> : null}
        <Skeleton className="h-2.5 w-20" />
      </div>
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={cn(rowGrid(withRule), 'py-2.5')}>
            <Skeleton className="my-1 h-3 w-20 max-sm:hidden" />
            <Skeleton className="my-1 h-3 w-10" />
            {withRule ? <Skeleton className="my-1 h-3 w-32" /> : null}
            <span className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-28" />
              </span>
              <Skeleton className="h-3 w-3/4" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
