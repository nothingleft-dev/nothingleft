export type StarterId = 'blank' | 'runbook' | 'decision' | 'onboarding';

export interface Starter {
  id: StarterId;
  name: string;
  description: string;
  body: string;
}

export const STARTERS: readonly Starter[] = [
  {
    id: 'runbook',
    name: 'Runbook',
    description: 'The steps to follow when something specific goes wrong.',
    body: `## When to use this

Describe the alert, symptom or request that sends someone here.

## Before you start

- [ ] Access you need
- [ ] Who to tell

## Steps

1. First step
2. Second step
3. How to confirm it worked

## If it does not work

Who to escalate to, and what to tell them.
`,
  },
  {
    id: 'decision',
    name: 'Decision record',
    description: 'What was decided, why, and what else was considered.',
    body: `## Context

What made a decision necessary.

## Decision

What we will do.

## Options considered

| Option | For | Against |
| --- | --- | --- |
| | | |

## Consequences

What becomes easier, and what becomes harder.
`,
  },
  {
    id: 'onboarding',
    name: 'Onboarding guide',
    description: 'Everything a new person needs in their first week.',
    body: `## Welcome

What this project is and who works on it.

## First day

- [ ] Accounts and access
- [ ] Read the architecture overview
- [ ] Meet the team

## First week

- [ ] Pick up a first issue
- [ ] Ship something small

## Who to ask

| Topic | Person |
| --- | --- |
| | |
`,
  },
  { id: 'blank', name: 'Blank article', description: 'Start from an empty page.', body: '' },
];

export const starterById = (id: StarterId) => STARTERS.find(s => s.id === id)!;
