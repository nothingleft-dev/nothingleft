// The one fictional data set every page draws from: Acme's ACME project, Sept–Oct 2026.
// Moments are Acme's local time as 'YYYY-MM-DD HH:MM', so they compare as strings.

export const ORG = { name: 'Acme', project: 'ACME' } as const;

export type Moment = string;
export type IsoDate = string;

// The latest moment the data covers; anything shown without a date is as of now.
export const NOW: Moment = '2026-10-13 09:20';

export type Handle = 'alex' | 'casey' | 'jordan' | 'sam';

export interface Person {
  handle: Handle;
  name: string;
  initials: string;
}

export const PEOPLE: Person[] = [
  { handle: 'alex', name: 'Alex Lee', initials: 'AL' },
  { handle: 'casey', name: 'Casey Kim', initials: 'CK' },
  { handle: 'jordan', name: 'Jordan', initials: 'J' },
  { handle: 'sam', name: 'Sam Ortiz', initials: 'SO' },
];

export function person(handle: Handle): Person {
  const found = PEOPLE.find(candidate => candidate.handle === handle);
  if (!found) throw new Error(`Unknown person @${handle}`);
  return found;
}

export const firstName = (handle: Handle) => person(handle).name.split(' ')[0] ?? handle;

export type Timeline<T> = readonly { at: Moment; value: T }[];

export function valueAt<T>(timeline: Timeline<T> | undefined, at: Moment): T | undefined {
  let value: T | undefined;
  for (const entry of timeline ?? []) {
    if (entry.at > at) break;
    value = entry.value;
  }
  return value;
}

export type IssueType = 'Bug' | 'Feature' | 'Task' | 'Epic';
export type Priority = 'Critical' | 'Major' | 'Normal' | 'Minor';
export type Status = 'Open' | 'In Progress' | 'Reopened' | 'Fixed';
export type Severity = 'Low' | 'High' | 'Critical';
export type SprintName = 'Sprint 07' | 'Sprint 08' | 'Sprint 09';

export const RESOLVED_STATUSES: readonly Status[] = ['Fixed'];

export interface Attachment {
  name: string;
  size: string;
  at: Moment;
}

export interface Issue {
  key: string;
  title: string;
  type: IssueType;
  priority: Priority;
  reporter: Handle;
  created: Moment;
  status: Timeline<Status>;
  assignees: Timeline<Handle[]>;
  sprint?: Timeline<SprintName | null>;
  points?: Timeline<number>;
  estimate?: number;
  due?: IsoDate;
  severity?: Timeline<Severity>;
  parent?: Timeline<string>;
  dependsOn?: Timeline<string[]>;
  tags?: string[];
  attachments?: Attachment[];
}

const UNASSIGNED: Handle[] = [];

export const ISSUES: Issue[] = [
  {
    key: 'ACME-1',
    title: 'Sign-up form rejects plus addresses',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'alex',
    created: '2026-09-01 10:02',
    status: [
      { at: '2026-09-01 10:02', value: 'Open' },
      { at: '2026-09-24 15:00', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-09-01 10:02', value: ['alex'] }],
  },
  {
    key: 'ACME-2',
    title: 'Password hint is cut off on small screens',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'alex',
    created: '2026-09-01 10:03',
    status: [
      { at: '2026-09-01 10:03', value: 'Open' },
      { at: '2026-10-12 15:00', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-09-01 10:03', value: ['jordan'] }],
    sprint: [{ at: '2026-10-03 10:00', value: 'Sprint 08' }],
    points: [{ at: '2026-10-03 10:00', value: 1 }],
    severity: [{ at: '2026-09-01 10:03', value: 'Low' }],
  },
  {
    key: 'ACME-3',
    title: 'Make invitations clearer',
    type: 'Epic',
    priority: 'Normal',
    reporter: 'alex',
    created: '2026-09-01 10:04',
    status: [{ at: '2026-09-01 10:04', value: 'Open' }],
    assignees: [{ at: '2026-09-01 10:04', value: UNASSIGNED }],
    estimate: 960,
  },
  {
    key: 'ACME-4',
    title: 'Invite expiry setting per org',
    type: 'Task',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-09-28 11:00',
    status: [
      { at: '2026-09-28 11:00', value: 'Open' },
      { at: '2026-10-06 17:30', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-09-28 11:00', value: ['sam'] }],
    sprint: [{ at: '2026-10-03 10:00', value: 'Sprint 08' }],
    points: [{ at: '2026-10-03 10:00', value: 3 }],
  },
  {
    key: 'ACME-5',
    title: 'Accept invite while signed in',
    type: 'Bug',
    priority: 'Major',
    reporter: 'casey',
    created: '2026-09-28 11:10',
    status: [
      { at: '2026-09-28 11:10', value: 'Open' },
      { at: '2026-10-06 10:00', value: 'In Progress' },
      { at: '2026-10-07 10:00', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-09-28 11:10', value: ['alex'] }],
    sprint: [{ at: '2026-10-03 10:00', value: 'Sprint 08' }],
    points: [{ at: '2026-10-03 10:00', value: 5 }],
    severity: [{ at: '2026-09-28 11:10', value: 'High' }],
  },
  {
    key: 'ACME-6',
    title: 'Project-scoped invite links',
    type: 'Feature',
    priority: 'Major',
    reporter: 'casey',
    created: '2026-09-28 11:20',
    status: [
      { at: '2026-09-28 11:20', value: 'Open' },
      { at: '2026-10-06 13:00', value: 'In Progress' },
      { at: '2026-10-09 15:00', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-09-28 11:20', value: ['jordan'] }],
    sprint: [{ at: '2026-10-03 10:00', value: 'Sprint 08' }],
    points: [{ at: '2026-10-03 10:00', value: 8 }],
  },
  {
    key: 'ACME-7',
    title: 'Burndown ignores late additions',
    type: 'Bug',
    priority: 'Critical',
    reporter: 'sam',
    created: '2026-09-29 09:30',
    status: [{ at: '2026-09-29 09:30', value: 'Open' }],
    assignees: [{ at: '2026-09-29 09:30', value: UNASSIGNED }],
    severity: [{ at: '2026-09-29 09:30', value: 'Critical' }],
  },
  {
    key: 'ACME-8',
    title: 'Saved view count is stale',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-09-29 10:00',
    status: [
      { at: '2026-09-29 10:00', value: 'Open' },
      { at: '2026-10-01 16:00', value: 'Fixed' },
      { at: '2026-10-05 09:10', value: 'Reopened' },
    ],
    assignees: [{ at: '2026-09-29 10:00', value: ['sam'] }],
    points: [{ at: '2026-09-29 10:00', value: 2 }],
    estimate: 60,
    severity: [{ at: '2026-09-29 10:00', value: 'High' }],
  },
  {
    key: 'ACME-9',
    title: 'Upload stalls at 100% on slow links',
    type: 'Bug',
    priority: 'Major',
    reporter: 'casey',
    created: '2026-09-29 14:00',
    status: [{ at: '2026-09-29 14:00', value: 'Open' }],
    assignees: [{ at: '2026-09-29 14:00', value: UNASSIGNED }],
    sprint: [
      { at: '2026-09-29 14:00', value: null },
      { at: '2026-10-05 09:30', value: 'Sprint 08' },
    ],
    points: [{ at: '2026-10-05 09:30', value: 2 }],
    severity: [{ at: '2026-09-29 14:00', value: 'Critical' }],
  },
  {
    key: 'ACME-10',
    title: 'Invite landing shows the inviter',
    type: 'Feature',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-09-29 15:00',
    status: [
      { at: '2026-09-29 15:00', value: 'Open' },
      { at: '2026-09-30 10:00', value: 'In Progress' },
    ],
    assignees: [{ at: '2026-09-29 15:00', value: ['alex'] }],
    sprint: [
      { at: '2026-09-29 15:00', value: 'Sprint 07' },
      { at: '2026-10-02 18:00', value: 'Sprint 08' },
    ],
    points: [{ at: '2026-09-29 15:00', value: 3 }],
    estimate: 300,
    parent: [{ at: '2026-10-09 11:00', value: 'ACME-3' }],
  },
  {
    key: 'ACME-11',
    title: 'Swimlane header overlaps count',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'sam',
    created: '2026-09-30 11:00',
    status: [
      { at: '2026-09-30 11:00', value: 'Open' },
      { at: '2026-10-05 09:00', value: 'In Progress' },
    ],
    assignees: [{ at: '2026-09-30 11:00', value: ['casey'] }],
    sprint: [{ at: '2026-10-03 10:00', value: 'Sprint 08' }],
    points: [{ at: '2026-10-03 10:00', value: 5 }],
    estimate: 120,
    severity: [{ at: '2026-09-30 11:00', value: 'High' }],
  },
  {
    key: 'ACME-12',
    title: 'Invite link blank after it expires',
    type: 'Bug',
    priority: 'Major',
    reporter: 'casey',
    created: '2026-10-02 09:05',
    status: [
      { at: '2026-10-02 09:05', value: 'Open' },
      { at: '2026-10-06 09:20', value: 'In Progress' },
      { at: '2026-10-08 16:40', value: 'Fixed' },
    ],
    assignees: [
      { at: '2026-10-02 09:05', value: UNASSIGNED },
      { at: '2026-10-03 10:14', value: ['alex'] },
    ],
    sprint: [
      { at: '2026-10-02 09:05', value: null },
      { at: '2026-10-03 10:14', value: 'Sprint 08' },
    ],
    points: [{ at: '2026-10-03 10:14', value: 3 }],
    estimate: 120,
    due: '2026-10-09',
    severity: [
      { at: '2026-10-02 09:05', value: 'High' },
      { at: '2026-10-05 11:30', value: 'Critical' },
    ],
    parent: [{ at: '2026-10-09 11:00', value: 'ACME-3' }],
    dependsOn: [{ at: '2026-10-05 11:28', value: ['ACME-4'] }],
    tags: ['invitations'],
    attachments: [{ name: 'invite-expired.log', size: '18 KB', at: '2026-10-06 14:12' }],
  },
  {
    key: 'ACME-13',
    title: 'Invite expiry date shown in UTC',
    type: 'Bug',
    priority: 'Minor',
    reporter: 'casey',
    created: '2026-10-02 09:20',
    status: [
      { at: '2026-10-02 09:20', value: 'Open' },
      { at: '2026-10-07 17:00', value: 'Fixed' },
    ],
    assignees: [
      { at: '2026-10-02 09:20', value: ['casey'] },
      { at: '2026-10-05 11:34', value: ['alex'] },
    ],
    sprint: [
      { at: '2026-10-02 09:20', value: null },
      { at: '2026-10-05 11:34', value: 'Sprint 08' },
    ],
    points: [{ at: '2026-10-05 11:34', value: 1 }],
    severity: [{ at: '2026-10-02 09:20', value: 'Low' }],
    parent: [{ at: '2026-10-05 11:34', value: 'ACME-12' }],
  },
  {
    key: 'ACME-14',
    title: 'Invite email subject names the org',
    type: 'Task',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-10-02 09:40',
    status: [{ at: '2026-10-02 09:40', value: 'Open' }],
    assignees: [{ at: '2026-10-02 09:40', value: ['casey'] }],
    sprint: [
      { at: '2026-10-02 09:40', value: null },
      { at: '2026-10-03 10:08', value: 'Sprint 08' },
    ],
    points: [{ at: '2026-10-02 09:40', value: 2 }],
    estimate: 60,
    parent: [{ at: '2026-10-09 11:00', value: 'ACME-3' }],
    tags: ['invitations'],
  },
  {
    key: 'ACME-15',
    title: 'Resend invite from the members list',
    type: 'Feature',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-10-02 09:50',
    status: [{ at: '2026-10-02 09:50', value: 'Open' }],
    assignees: [
      { at: '2026-10-02 09:50', value: UNASSIGNED },
      { at: '2026-10-08 17:00', value: ['sam'] },
      { at: '2026-10-09 10:00', value: ['alex', 'sam'] },
    ],
    sprint: [
      { at: '2026-10-02 09:50', value: null },
      { at: '2026-10-03 10:06', value: 'Sprint 08' },
    ],
    points: [{ at: '2026-10-02 09:50', value: 1 }],
    estimate: 360,
    parent: [{ at: '2026-10-09 11:00', value: 'ACME-3' }],
    tags: ['invitations'],
  },
  {
    key: 'ACME-16',
    title: 'Reminder email before an invite expires',
    type: 'Feature',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-10-02 10:00',
    status: [{ at: '2026-10-02 10:00', value: 'Open' }],
    assignees: [{ at: '2026-10-02 10:00', value: UNASSIGNED }],
    sprint: [
      { at: '2026-10-02 10:00', value: null },
      { at: '2026-10-05 16:00', value: 'Sprint 09' },
    ],
    points: [{ at: '2026-10-02 10:00', value: 3 }],
    tags: ['invitations'],
  },
  {
    key: 'ACME-17',
    title: 'Show who invited each member',
    type: 'Feature',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-10-02 10:05',
    status: [{ at: '2026-10-02 10:05', value: 'Open' }],
    assignees: [{ at: '2026-10-02 10:05', value: UNASSIGNED }],
    sprint: [
      { at: '2026-10-02 10:05', value: null },
      { at: '2026-10-05 16:00', value: 'Sprint 09' },
    ],
    points: [{ at: '2026-10-02 10:05', value: 2 }],
  },
  {
    key: 'ACME-18',
    title: 'Revoke a pending invitation',
    type: 'Feature',
    priority: 'Normal',
    reporter: 'casey',
    created: '2026-10-02 10:10',
    status: [{ at: '2026-10-02 10:10', value: 'Open' }],
    assignees: [{ at: '2026-10-02 10:10', value: UNASSIGNED }],
    sprint: [
      { at: '2026-10-02 10:10', value: null },
      { at: '2026-10-05 16:00', value: 'Sprint 09' },
    ],
    points: [{ at: '2026-10-02 10:10', value: 5 }],
    tags: ['invitations'],
  },
  {
    key: 'ACME-19',
    title: 'Invite form explains each role',
    type: 'Task',
    priority: 'Minor',
    reporter: 'casey',
    created: '2026-10-02 10:15',
    status: [{ at: '2026-10-02 10:15', value: 'Open' }],
    assignees: [{ at: '2026-10-02 10:15', value: UNASSIGNED }],
    sprint: [
      { at: '2026-10-02 10:15', value: null },
      { at: '2026-10-05 16:00', value: 'Sprint 09' },
    ],
    points: [{ at: '2026-10-02 10:15', value: 1 }],
    tags: ['invitations'],
  },
  {
    key: 'ACME-20',
    title: 'Members list stops at 50 people',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'sam',
    created: '2026-10-05 14:00',
    status: [{ at: '2026-10-05 14:00', value: 'Open' }],
    assignees: [{ at: '2026-10-05 14:00', value: UNASSIGNED }],
    points: [{ at: '2026-10-05 14:00', value: 3 }],
    severity: [{ at: '2026-10-05 14:00', value: 'High' }],
  },
  {
    key: 'ACME-21',
    title: 'Avatar initials clash for similar names',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'jordan',
    created: '2026-10-05 14:30',
    status: [{ at: '2026-10-05 14:30', value: 'Open' }],
    assignees: [{ at: '2026-10-05 14:30', value: UNASSIGNED }],
    points: [{ at: '2026-10-05 14:30', value: 2 }],
    severity: [{ at: '2026-10-05 14:30', value: 'Low' }],
  },
  {
    key: 'ACME-22',
    title: 'Remember the last board filter',
    type: 'Feature',
    priority: 'Normal',
    reporter: 'alex',
    created: '2026-10-05 15:00',
    status: [{ at: '2026-10-05 15:00', value: 'Open' }],
    assignees: [{ at: '2026-10-05 15:00', value: UNASSIGNED }],
  },
  {
    key: 'ACME-23',
    title: 'Due date picker starts on Monday',
    type: 'Task',
    priority: 'Normal',
    reporter: 'jordan',
    created: '2026-10-05 15:20',
    status: [{ at: '2026-10-05 15:20', value: 'Open' }],
    assignees: [{ at: '2026-10-05 15:20', value: UNASSIGNED }],
    points: [{ at: '2026-10-05 15:20', value: 1 }],
  },
  {
    key: 'ACME-24',
    title: 'Partner sync stops after a key rotation',
    type: 'Bug',
    priority: 'Critical',
    reporter: 'casey',
    created: '2026-10-12 08:40',
    status: [
      { at: '2026-10-12 08:40', value: 'Open' },
      { at: '2026-10-12 16:10', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-10-12 08:40', value: ['sam'] }],
    severity: [{ at: '2026-10-12 08:40', value: 'High' }],
    tags: ['sync-outage'],
  },
  {
    key: 'ACME-25',
    title: 'Sync log hides the rejected key error',
    type: 'Bug',
    priority: 'Normal',
    reporter: 'sam',
    created: '2026-10-12 16:30',
    status: [
      { at: '2026-10-12 16:30', value: 'Open' },
      { at: '2026-10-12 17:45', value: 'Fixed' },
    ],
    assignees: [{ at: '2026-10-12 16:30', value: ['sam'] }],
    severity: [{ at: '2026-10-12 16:30', value: 'Low' }],
    tags: ['sync-outage'],
  },
];

export function issue(key: string): Issue {
  const found = ISSUES.find(candidate => candidate.key === key);
  if (!found) throw new Error(`${key} is not in the sample data`);
  return found;
}

export const statusOf = (key: string, at: Moment = NOW): Status => valueAt(issue(key).status, at) ?? 'Open';
export const isResolved = (status: Status) => RESOLVED_STATUSES.includes(status);
export const isResolvedAt = (key: string, at: Moment = NOW) => isResolved(statusOf(key, at));
export const assigneesOf = (key: string, at: Moment = NOW): Person[] =>
  (valueAt(issue(key).assignees, at) ?? []).map(person);
export const sprintOf = (key: string, at: Moment = NOW): SprintName | null => valueAt(issue(key).sprint, at) ?? null;
export const pointsOf = (key: string, at: Moment = NOW): number | null => valueAt(issue(key).points, at) ?? null;
export const severityOf = (key: string, at: Moment = NOW): Severity | null => valueAt(issue(key).severity, at) ?? null;
export const parentOf = (key: string, at: Moment = NOW): string | null => valueAt(issue(key).parent, at) ?? null;
export const dependsOnOf = (key: string, at: Moment = NOW): string[] => valueAt(issue(key).dependsOn, at) ?? [];

export function resolvedAt(key: string): Moment | null {
  return issue(key).status.find(change => isResolved(change.value))?.at ?? null;
}

export const existsAt = (key: string, at: Moment = NOW) => issue(key).created <= at;

export const subtasksOf = (key: string, at: Moment = NOW): Issue[] =>
  ISSUES.filter(candidate => existsAt(candidate.key, at) && parentOf(candidate.key, at) === key);

export function issuesInSprint(name: SprintName, at: Moment = NOW): Issue[] {
  const order = SPRINTS.find(candidate => candidate.name === name)?.order ?? [];
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  return ISSUES.filter(candidate => existsAt(candidate.key, at) && sprintOf(candidate.key, at) === name).sort(
    (a, b) => rank(a.key) - rank(b.key),
  );
}

export const backlogAt = (at: Moment = NOW): Issue[] =>
  ISSUES.filter(
    candidate =>
      existsAt(candidate.key, at) && sprintOf(candidate.key, at) === null && !isResolvedAt(candidate.key, at),
  );

export const sumPoints = (issues: Issue[], at: Moment = NOW) =>
  issues.reduce((total, candidate) => total + (pointsOf(candidate.key, at) ?? 0), 0);

export interface Comment {
  key: string;
  by: Handle;
  at: Moment;
  text: string;
}

export const COMMENTS: Comment[] = [
  {
    key: 'ACME-12',
    by: 'casey',
    at: '2026-10-03 10:12',
    text: '@alex you touched the invite flow last. Could you take this one?',
  },
  {
    key: 'ACME-12',
    by: 'alex',
    at: '2026-10-06 14:15',
    text: '@casey reproduced with a ten-day-old link. The log shows the token check returning before the page renders. The fix waits on ACME-4.',
  },
  {
    key: 'ACME-12',
    by: 'alex',
    at: '2026-10-08 16:40',
    text: 'Expired links now land on an explanation with a Request a new link button, per the decision record. Verified with a ten-day-old invite.',
  },
  {
    key: 'ACME-24',
    by: 'sam',
    at: '2026-10-12 16:10',
    text: 'Sync is running again. The rotated key had not reached the sync service, so every batch was rejected. Updated the key, replayed the failed batch, and the next run succeeded.',
  },
];

export function comment(key: string, by: Handle, onDay: IsoDate): Comment {
  const found = COMMENTS.find(
    candidate => candidate.key === key && candidate.by === by && candidate.at.startsWith(onDay),
  );
  if (!found) throw new Error(`No comment by @${by} on ${key} on ${onDay}`);
  return found;
}

export interface HistoryEntry {
  key: string;
  by: Handle;
  at: Moment;
  what: string;
}

// ACME-12's history as the issue page lists it; other pages quote entries from here.
export const HISTORY: HistoryEntry[] = [
  { key: 'ACME-12', by: 'casey', at: '2026-10-02 09:05', what: 'created the issue' },
  {
    key: 'ACME-12',
    by: 'casey',
    at: '2026-10-03 10:14',
    what: 'Assignee: Unassigned → Alex Lee, Estimation: 2h, Due date: 9 Oct 2026',
  },
  { key: 'ACME-12', by: 'casey', at: '2026-10-03 10:14', what: 'Sprint: Sprint 08, Story points: 3' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-05 11:28', what: 'linked: depends on ACME-4' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-05 11:30', what: 'Severity: High → Critical' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-05 11:34', what: 'linked: parent for ACME-13' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-06 09:20', what: 'Status: Open → In Progress' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-06 09:21', what: 'logged 20m, Development' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-06 14:12', what: 'attached invite-expired.log' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-08 16:38', what: 'logged 1h 25m, Development' },
  { key: 'ACME-12', by: 'alex', at: '2026-10-08 16:40', what: 'Status: In Progress → Fixed' },
];

export function updatedAt(key: string, at: Moment = NOW): Moment {
  const found = issue(key);
  const timelines = [
    found.status,
    found.assignees,
    found.sprint,
    found.points,
    found.severity,
    found.parent,
    found.dependsOn,
  ];
  const moments = [
    found.created,
    ...timelines.flatMap(timeline => (timeline ?? []).map(entry => entry.at)),
    ...COMMENTS.filter(entry => entry.key === key).map(entry => entry.at),
    ...HISTORY.filter(entry => entry.key === key).map(entry => entry.at),
  ].filter(moment => moment <= at);
  return moments.sort().at(-1) ?? found.created;
}

export interface Sprint {
  name: SprintName;
  goal?: string;
  start: IsoDate;
  end: IsoDate;
  startedAt?: Moment;
  // Backlog order, which the board keeps within each column.
  order?: string[];
}

export const SPRINTS: Sprint[] = [
  { name: 'Sprint 07', start: '2026-09-21', end: '2026-10-02', startedAt: '2026-09-21 09:00' },
  {
    name: 'Sprint 08',
    goal: 'Make invitations clearer',
    start: '2026-10-04',
    end: '2026-10-17',
    startedAt: '2026-10-04 18:00',
    order: [
      'ACME-12',
      'ACME-14',
      'ACME-15',
      'ACME-9',
      'ACME-11',
      'ACME-10',
      'ACME-6',
      'ACME-5',
      'ACME-4',
      'ACME-13',
      'ACME-2',
    ],
  },
  {
    name: 'Sprint 09',
    goal: 'Members can manage invitations without asking an admin',
    start: '2026-10-19',
    end: '2026-10-30',
  },
];

export function sprint(name: SprintName): Sprint {
  const found = SPRINTS.find(candidate => candidate.name === name);
  if (!found) throw new Error(`Unknown sprint ${name}`);
  return found;
}

export interface BurndownDay {
  date: IsoDate;
  working: boolean;
  scope: number | null;
  completed: number | null;
  remaining: number | null;
  ideal: number;
  live: boolean;
}

// Sprint 07 predates the issues modelled here, so its nightly figures are kept as recorded.
const SPRINT_07_RECORDED = {
  committed: 24,
  remaining: [24, 24, 21, 18, 16, 16, 16, 13, 19, 14, 8, 3],
  scopeAdded: [0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6],
  carriedOver: ['ACME-10'],
};

export const SPRINT_07_CARRIED_OVER = SPRINT_07_RECORDED.carriedOver;

export function datesBetween(start: IsoDate, end: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = (date: IsoDate) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? '';
export const isWorkingDay = (date: IsoDate) => weekday(date) !== 'Sat' && weekday(date) !== 'Sun';

const round1 = (n: number) => Math.round(n * 10) / 10;

// The ideal line runs from the first day's remaining to zero on the end date, falling only on working days.
function withIdeal(days: Omit<BurndownDay, 'ideal'>[]): BurndownDay[] {
  const startRemaining = days[0]?.remaining ?? 0;
  const planned = days.slice(1).filter(d => d.working).length;
  let elapsed = 0;
  return days.map((d, index) => {
    if (index > 0 && d.working) elapsed += 1;
    const last = index === days.length - 1;
    return { ...d, ideal: last ? 0 : round1(startRemaining * Math.max(0, 1 - elapsed / planned)) };
  });
}

// A day's figures are those recorded that night; today's are read live at NOW.
export function burndown(name: SprintName, now: Moment = NOW): BurndownDay[] {
  const { start, end } = sprint(name);
  const dates = datesBetween(start, end);
  if (name === 'Sprint 07') {
    return withIdeal(
      dates.map((date, index) => {
        const remaining = SPRINT_07_RECORDED.remaining[index] ?? 0;
        const scope = SPRINT_07_RECORDED.committed + (SPRINT_07_RECORDED.scopeAdded[index] ?? 0);
        return { date, working: isWorkingDay(date), scope, completed: scope - remaining, remaining, live: false };
      }),
    );
  }
  const today = now.slice(0, 10);
  return withIdeal(
    dates.map(date => {
      if (date > today)
        return { date, working: isWorkingDay(date), scope: null, completed: null, remaining: null, live: false };
      const at = date === today ? now : `${date} 23:59`;
      const inSprint = issuesInSprint(name, at);
      const scope = sumPoints(inSprint, at);
      const completed = sumPoints(
        inSprint.filter(candidate => isResolvedAt(candidate.key, at)),
        at,
      );
      return {
        date,
        working: isWorkingDay(date),
        scope,
        completed,
        remaining: scope - completed,
        live: date === today,
      };
    }),
  );
}

export interface SprintSummary {
  committed: number;
  added: number;
  scope: number;
  completed: number;
  remaining: number;
}

export function sprintSummary(name: SprintName, now: Moment = NOW): SprintSummary {
  const days = burndown(name, now).filter(d => d.scope !== null);
  const first = days[0];
  const last = days[days.length - 1];
  const committed = first?.scope ?? 0;
  const scope = last?.scope ?? 0;
  const completed = last?.completed ?? 0;
  return { committed, added: scope - committed, scope, completed, remaining: scope - completed };
}

export const daysLeft = (name: SprintName, now: Moment = NOW) =>
  Math.max(0, datesBetween(now.slice(0, 10), sprint(name).end).length - 1);

export interface Article {
  slug: string;
  title: string;
  kind: 'Decision record' | 'Runbook';
  folder: string;
  author: Handle;
  updatedBy: Handle;
  decided?: IsoDate;
  published: IsoDate;
  updated: IsoDate;
  references: string[];
  tags: string[];
}

export const ARTICLES: Article[] = [
  {
    slug: 'invitation-links-and-expiry',
    title: 'Invitation links and expiry',
    kind: 'Decision record',
    folder: 'Decisions',
    author: 'alex',
    updatedBy: 'alex',
    decided: '2026-10-02',
    published: '2026-10-02',
    updated: '2026-10-02',
    references: ['ACME-12'],
    tags: ['decision', 'invitations'],
  },
  {
    slug: 'restoring-a-failed-sync',
    title: 'Restoring a failed sync',
    kind: 'Runbook',
    folder: 'Runbooks',
    author: 'sam',
    updatedBy: 'sam',
    published: '2026-10-12',
    updated: '2026-10-12',
    references: ['ACME-24'],
    tags: ['runbook', 'sync-outage'],
  },
];

export function article(slug: string): Article {
  const found = ARTICLES.find(candidate => candidate.slug === slug);
  if (!found) throw new Error(`Unknown article ${slug}`);
  return found;
}

export const articleUri = (slug: string) => `article://${ORG.project}/${slug}`;
export const articlePath = (slug: string) => `/projects/${ORG.project}/articles/${slug}`;

// Acme keeps the default working calendar: 1d is 8h and 1w is five days.
const WORKDAY_MINUTES = 480;
const WORKWEEK_DAYS = 5;

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  let rest = Math.abs(minutes);
  if (rest === 0) return '0m';
  const parts: string[] = [];
  for (const [size, unit] of [
    [WORKDAY_MINUTES * WORKWEEK_DAYS, 'w'],
    [WORKDAY_MINUTES, 'd'],
    [60, 'h'],
    [1, 'm'],
  ] as const) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${count}${unit}`);
    rest -= count * size;
  }
  return sign + parts.join(' ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(date: IsoDate | Moment): string {
  const [year, month, dayOfMonth] = date.slice(0, 10).split('-').map(Number);
  return `${dayOfMonth} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

export const formatDayMonth = (date: IsoDate | Moment) => formatDate(date).replace(/ \d{4}$/, '');

export function formatClock(at: Moment): string {
  const [hours = 0, minutes = 0] = at.slice(11, 16).split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

export const formatMoment = (at: Moment) => `${formatDate(at)}, ${formatClock(at)}`;

export const formatSprintDates = (name: SprintName) => {
  const { start, end } = sprint(name);
  return `${formatDayMonth(start)} – ${formatDate(end)}`;
};

export interface TimeEntry {
  author: Handle;
  date: IsoDate;
  issue: string;
  minutes: number;
  workType: string;
  loggedBy?: Handle;
}

export const TIME_WEEK = { start: '2026-10-05', end: '2026-10-11', label: '5–11 Oct 2026' };

// Every logged minute of the week; every time figure on the site is a sum of these.
export const TIME_ENTRIES: TimeEntry[] = [
  { author: 'alex', date: '2026-10-05', issue: 'ACME-10', minutes: 90, workType: 'Development' },
  { author: 'alex', date: '2026-10-06', issue: 'ACME-10', minutes: 90, workType: 'Development' },
  { author: 'alex', date: '2026-10-06', issue: 'ACME-12', minutes: 20, workType: 'Development' },
  { author: 'alex', date: '2026-10-07', issue: 'ACME-10', minutes: 45, workType: 'Testing' },
  { author: 'alex', date: '2026-10-08', issue: 'ACME-12', minutes: 85, workType: 'Development' },
  { author: 'alex', date: '2026-10-09', issue: 'ACME-15', minutes: 60, workType: 'Investigation' },
  { author: 'casey', date: '2026-10-05', issue: 'ACME-11', minutes: 60, workType: 'Development' },
  { author: 'casey', date: '2026-10-06', issue: 'ACME-11', minutes: 30, workType: 'Testing' },
  { author: 'casey', date: '2026-10-07', issue: 'ACME-14', minutes: 60, workType: 'Development' },
  { author: 'casey', date: '2026-10-08', issue: 'ACME-14', minutes: 30, workType: 'Testing' },
  { author: 'sam', date: '2026-10-05', issue: 'ACME-8', minutes: 45, workType: 'Investigation' },
  { author: 'sam', date: '2026-10-07', issue: 'ACME-15', minutes: 120, workType: 'Development', loggedBy: 'casey' },
  { author: 'sam', date: '2026-10-08', issue: 'ACME-15', minutes: 75, workType: 'Development' },
  { author: 'sam', date: '2026-10-09', issue: 'ACME-10', minutes: 30, workType: 'Testing' },
];

const totalMinutes = (entries: TimeEntry[]) => entries.reduce((total, entry) => total + entry.minutes, 0);

export const entriesFor = (filter: Partial<Pick<TimeEntry, 'author' | 'date' | 'issue'>>) =>
  TIME_ENTRIES.filter(
    entry =>
      (filter.author === undefined || entry.author === filter.author) &&
      (filter.date === undefined || entry.date === filter.date) &&
      (filter.issue === undefined || entry.issue === filter.issue),
  );

export const minutesFor = (filter: Partial<Pick<TimeEntry, 'author' | 'date' | 'issue'>>) =>
  totalMinutes(entriesFor(filter));

// An issue's spent time is its own entries plus its whole subtree's.
export function spentOn(key: string, at: Moment = NOW): number {
  return minutesFor({ issue: key }) + subtasksOf(key, at).reduce((total, child) => total + spentOn(child.key, at), 0);
}
