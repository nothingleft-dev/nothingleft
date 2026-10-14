'use client';

import Link from 'next/link';
import type { Route } from 'next';
import {
  CalendarDays,
  ChartBarBig,
  ChartGantt,
  ChevronRight,
  FolderKanban,
  Grid3x3,
  Hourglass,
  Timer,
  TrendingDown,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReportName } from '@nothingleft/types';
import { PageHeader } from '@components/page-header';
import { daysLeftLabel } from '@components/agile/sprint-dates';
import { useActiveSprints } from '@hooks/use-sprints';
import { useProject } from '@hooks/use-projects';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { REPORT_SECTIONS, REPORTS, type ReportDef } from '@lib/reports/registry';

const ICONS: Record<ReportName, LucideIcon> = {
  'issues-per-assignee': Users,
  'issues-per-project': FolderKanban,
  'issues-per-field': ChartBarBig,
  matrix: Grid3x3,
  'average-age': Hourglass,
  burndown: TrendingDown,
  gantt: ChartGantt,
  time: Timer,
  timesheet: CalendarDays,
};

function hrefFor(report: ReportDef, project: string | undefined): Route {
  const base = report.name === 'timesheet' ? '/timesheets' : `/reports/${report.name}`;
  if (!project) return base as Route;
  return `${base}?${report.oneProject ? 'project' : 'projects'}=${project}` as Route;
}

/** Every report, as rows: `/reports` across the organisation, `/projects/PROJ/reports` scoped to one project. */
export function ReportIndex({ project }: { project?: string }) {
  const projectQuery = useProject(project ?? null);
  useRecordProjectVisit(project ?? null);
  const sprints = useActiveSprints(project !== undefined);
  const active = project ? sprints.data?.find(s => s.project.key === project) : undefined;
  // Issues per project means nothing inside one project.
  const reports = project ? REPORTS.filter(r => r.name !== 'issues-per-project') : REPORTS;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" />
      <p className="-mt-3 text-text-secondary">
        {project
          ? `Charts over ${projectQuery.data?.name ?? project}'s issues and time. Every bar, slice and cell opens the issues it counts.`
          : 'Charts over the issues and time you can open. Every bar, slice and cell opens the issues it counts.'}
      </p>
      {REPORT_SECTIONS.map(section => (
        <section key={section} className="flex flex-col">
          <h2 className="mb-1 text-xs font-medium text-text-secondary">{section}</h2>
          <ul className="flex flex-col border-t">
            {reports
              .filter(r => r.section === section)
              .map(report => {
                const Icon = ICONS[report.name];
                const hint =
                  report.name === 'burndown' && project
                    ? active
                      ? active.days_left === null
                        ? active.name
                        : `${active.name}, ${daysLeftLabel(active.days_left).toLowerCase()}`
                      : 'No active sprint; choose one'
                    : null;
                return (
                  <li key={report.name} className="border-b">
                    <Link
                      href={hrefFor(report, project)}
                      className="group flex min-h-12 items-center gap-3 px-2 py-2 hover:bg-hover"
                    >
                      <Icon className="size-icon flex-none text-text-secondary group-hover:text-text" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
                        <span className="font-medium md:w-48 md:flex-none">{report.title}</span>
                        <span className="truncate text-xs text-text-secondary">{report.description}</span>
                      </span>
                      {hint ? <span className="text-xs text-text-secondary max-sm:hidden">{hint}</span> : null}
                      <ChevronRight className="size-icon-sm flex-none text-text-muted group-hover:text-text" />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
