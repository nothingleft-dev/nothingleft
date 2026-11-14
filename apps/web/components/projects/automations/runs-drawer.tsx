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
import { useAutomationRuns } from '@hooks/use-automations';
import { RUN_RESULT, SKIP_REASON } from '@lib/git/words';
import { formatCount } from '@lib/numbers';

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
        <SheetTitle>{target.automation ? `Runs of ${target.automation}` : 'Automation runs'}</SheetTitle>
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
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 bg-app text-left text-2xs text-text-secondary">
              <tr>
                <th className="h-7 w-32 pr-4 pl-5 font-medium">When</th>
                <th className="w-20 pr-4 font-medium">Issue</th>
                {target.automation ? null : <th className="w-44 pr-4 font-medium">Rule</th>}
                <th className="w-48 pr-4 font-medium">Result</th>
                <th className="pr-5 font-medium">Because</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(run => (
                <RunRow key={run.id} run={run} withRule={!target.automation} />
              ))}
            </tbody>
          </table>
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

function RunRow({ run, withRule }: { run: AutomationRun; withRule: boolean }) {
  const { label, hue } = RUN_RESULT[run.result];
  const change = changeOf(run);
  const note = change ? null : run.reason ? SKIP_REASON[run.reason] : run.result === 'failed' ? FAILED_NOTE : null;
  return (
    <tr className="align-top">
      <td className="py-2.5 pr-4 pl-5">
        <RelativeTime value={run.created_at} className="text-xs whitespace-nowrap tabular" />
      </td>
      <td className="py-2.5 pr-4">
        <Link href={`/issue/${run.issue}` as Route} className="font-mono text-xs hover:underline">
          {run.issue}
        </Link>
      </td>
      {withRule ? (
        <td className="py-2.5 pr-4 text-xs">
          <span className="line-clamp-2" title={run.automation}>
            {run.automation}
          </span>
        </td>
      ) : null}
      <td className="py-2.5 pr-4">
        <span className="flex flex-col items-start gap-1">
          <HueChip hue={hue}>{label}</HueChip>
          {change ? (
            <span className="text-xs text-text">
              {change.from} → <b className="font-medium">{change.to}</b>
            </span>
          ) : note ? (
            <span className="text-xs text-text-secondary">{note}</span>
          ) : null}
        </span>
      </td>
      <td className="py-2.5 pr-5 text-xs text-text-secondary">
        <Cause text={run.cause} />
      </td>
    </tr>
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
      <span ref={ref} className={open ? '[overflow-wrap:anywhere]' : 'line-clamp-3 [overflow-wrap:anywhere]'}>
        {text}
      </span>
      {clamped ? (
        <TextButton className="text-xs" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {open ? 'Show less' : 'Show all'}
        </TextButton>
      ) : null}
    </span>
  );
}

function RunsSkeleton({ withRule }: { withRule: boolean }) {
  return (
    <table className="w-full table-fixed" role="status" aria-label="Loading runs">
      <thead className="bg-app">
        <tr>
          <th className="h-7 w-32 pr-4 pl-5">
            <Skeleton className="h-2.5 w-10" />
          </th>
          <th className="w-20 pr-4">
            <Skeleton className="h-2.5 w-10" />
          </th>
          {withRule ? (
            <th className="w-44 pr-4">
              <Skeleton className="h-2.5 w-10" />
            </th>
          ) : null}
          <th className="w-48 pr-4">
            <Skeleton className="h-2.5 w-12" />
          </th>
          <th className="pr-5">
            <Skeleton className="h-2.5 w-14" />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {Array.from({ length: 6 }, (_, i) => (
          <tr key={i} className="align-top">
            <td className="py-3 pr-4 pl-5">
              <Skeleton className="h-3 w-20" />
            </td>
            <td className="py-3 pr-4">
              <Skeleton className="h-3 w-10" />
            </td>
            {withRule ? (
              <td className="py-3 pr-4">
                <Skeleton className="h-3 w-32" />
              </td>
            ) : null}
            <td className="py-3 pr-4">
              <span className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-28" />
              </span>
            </td>
            <td className="py-3 pr-5">
              <span className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
