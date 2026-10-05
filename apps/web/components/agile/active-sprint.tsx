'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { Sprint } from '@nothingleft/types';
import { Skeleton } from '@components/ui/skeleton';
import { Markdown } from '@components/markdown/markdown';
import { Meter } from '@components/dashboard/meter';
import { StatusDistribution } from '@components/dashboard/status-strip';
import { DaysLeft, SprintDates } from '@components/agile/sprint-dates';

export const boardHref = (projectKey: string) => `/projects/${projectKey}/board` as Route;
export const backlogHref = (projectKey: string) => `/projects/${projectKey}/backlog` as Route;

/** My work's rail: a sprint the viewer has issues in, with their share of it. */
export function ActiveSprintRow({ sprint }: { sprint: Sprint }) {
  const mine = sprint.progress.mine;
  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle px-2 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xs text-text-muted">{sprint.project.key}</span>
        <Link href={boardHref(sprint.project.key)} className="min-w-0 truncate text-sm font-medium hover:underline">
          {sprint.name}
        </Link>
        <DaysLeft days={sprint.days_left} className="ml-auto" />
      </div>
      <StatusDistribution statuses={sprint.progress.by_status} />
      <p className="text-2xs text-text-secondary">
        You: <b className="font-medium tabular text-text">{mine.resolved_issues}</b> of{' '}
        <b className="font-medium tabular text-text">{mine.issues}</b> resolved
      </p>
    </li>
  );
}

export function ActiveSprintRowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-border-subtle px-2 py-3">
          <div className="flex gap-2">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-14" />
          </div>
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** The project card's sprint line: name, dates, days left above the strip. */
export function ActiveSprintLine({ sprint }: { sprint: Sprint }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <Link href={boardHref(sprint.project.key)} className="min-w-0 truncate font-medium hover:underline">
          {sprint.name}
        </Link>
        <SprintDates sprint={sprint} className="text-xs" />
        <DaysLeft days={sprint.days_left} className="ml-auto" />
      </div>
      <StatusDistribution statuses={sprint.progress.by_status} className="mt-2" />
    </div>
  );
}

/** The project dashboard's section body. */
export function ActiveSprintPanel({ sprint }: { sprint: Sprint }) {
  const { progress } = sprint;
  const pointsRatio = progress.points ? progress.resolved_points / progress.points : 0;
  return (
    <div className="flex flex-col gap-3 px-2 py-1">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <Link href={boardHref(sprint.project.key)} className="min-w-0 truncate font-medium hover:underline">
            {sprint.name}
          </Link>
          <DaysLeft days={sprint.days_left} className="ml-auto" />
        </div>
        <SprintDates sprint={sprint} className="text-xs" />
      </div>
      {sprint.goal_md ? (
        <Markdown source={sprint.goal_md} variant="comment" className="text-xs text-text-secondary" />
      ) : null}
      <StatusDistribution statuses={progress.by_status} />
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between text-text-secondary">
          <span>Story points</span>
          <b className="font-medium tabular text-text">
            {progress.resolved_points} of {progress.points} resolved
          </b>
        </div>
        <Meter ratio={pointsRatio} label="Story points resolved" />
        <div className="flex justify-between text-text-secondary">
          <span>Issues</span>
          <b className="font-medium tabular text-text">
            {progress.resolved_issues} of {progress.issues} resolved
          </b>
        </div>
      </div>
      <div className="flex gap-3 text-xs">
        <Link href={boardHref(sprint.project.key)} className="text-text-secondary hover:text-text hover:underline">
          Open the board
        </Link>
        <Link href={backlogHref(sprint.project.key)} className="text-text-secondary hover:text-text hover:underline">
          Backlog
        </Link>
      </div>
    </div>
  );
}
