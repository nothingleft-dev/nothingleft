import { REPORT_NAMES, type ReportName } from '@nothingleft/types';

export type ReportSection = 'Issues' | 'Sprints and schedule' | 'Time';

export interface ReportDef {
  name: ReportName;
  title: string;
  description: string;
  section: ReportSection;
  /** Burndown and Gantt read one project; the rest take any number. */
  oneProject: boolean;
}

export const REPORTS: readonly ReportDef[] = [
  {
    name: 'issues-per-assignee',
    title: 'Issues per assignee',
    description: 'How issues spread over the people they are assigned to.',
    section: 'Issues',
    oneProject: false,
  },
  {
    name: 'issues-per-project',
    title: 'Issues per project',
    description: 'How issues spread over the organisation’s projects.',
    section: 'Issues',
    oneProject: false,
  },
  {
    name: 'issues-per-field',
    title: 'Issues per field',
    description: 'Status, priority, type, tag, sprint, due date or any custom field.',
    section: 'Issues',
    oneProject: false,
  },
  {
    name: 'matrix',
    title: 'Matrix',
    description: 'Two fields at once, such as status by assignee, with every cell leading to its issues.',
    section: 'Issues',
    oneProject: false,
  },
  {
    name: 'average-age',
    title: 'Average issue age',
    description: 'How long issues have been open, per field value, with the oldest in each group.',
    section: 'Issues',
    oneProject: false,
  },
  {
    name: 'burndown',
    title: 'Burndown',
    description: 'Remaining work across a sprint against the ideal line, with scope added shown apart.',
    section: 'Sprints and schedule',
    oneProject: true,
  },
  {
    name: 'gantt',
    title: 'Gantt chart',
    description: 'A project’s issues on a timeline with their dependencies, and the ones missing dates.',
    section: 'Sprints and schedule',
    oneProject: true,
  },
  {
    name: 'time',
    title: 'Time report',
    description: 'Time logged over a period by work type, person, issue or project, against estimates.',
    section: 'Time',
    oneProject: false,
  },
  {
    name: 'timesheet',
    title: 'Timesheet',
    description: 'People by day, with totals both ways and the entries behind every cell.',
    section: 'Time',
    oneProject: false,
  },
];

export const REPORT_SECTIONS: readonly ReportSection[] = ['Issues', 'Sprints and schedule', 'Time'];

export const isReportName = (value: string): value is ReportName => (REPORT_NAMES as readonly string[]).includes(value);

export const reportDef = (name: ReportName) => REPORTS.find(r => r.name === name)!;
