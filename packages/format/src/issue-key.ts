export interface IssueKey {
  projectKey: string;
  number: number;
}

const ISSUE_KEY = /^([a-z0-9]{2,10})-([1-9]\d*)$/i;

/** `PMS-118` → its two halves, or `null`. Typed lowercase is accepted and folded up. */
export function parseIssueKey(value: string): IssueKey | null {
  const match = ISSUE_KEY.exec(value.trim());
  if (!match) return null;
  const [, projectKey, number] = match as unknown as [string, string, string];
  return { projectKey: projectKey.toUpperCase(), number: Number(number) };
}

export function formatIssueKey(projectKey: string, number: number): string {
  return `${projectKey.toUpperCase()}-${number}`;
}
