import { z } from 'zod';
import type { Sprint } from '@nothingleft/types';
import type { ToolContext } from '../tool.ts';
import { definePrompt } from '../surface.ts';
import { issueKey, projectKeyOf } from '../resolve.ts';
import { join } from '../render.ts';
import { renderIssue } from '../tools/issues.ts';
import { schemaMap } from '../tools/configuration.ts';
import { renderSprint } from '../tools/agile.ts';

const text = (what: string) => z.string().trim().min(1).max(2000).describe(what);
const org = text('Organisation slug, when you belong to more than one.').optional();
const project = text('Project key, e.g. "PP".');
const orgNote = (o: string | undefined) => (o ? ` Pass org: "${o}" to every tool.` : '');

export const triageIssue = definePrompt({
  name: 'triage-issue',
  title: 'Triage an issue',
  description:
    'Reads an issue and its project, then proposes type, priority, tags and assignee with a reason for each.',
  input: z.strictObject({ issue: text('Issue key, e.g. "PP-12".'), org }),
  async build(ctx, args) {
    const key = issueKey(args.issue);
    const [issue, schema] = await Promise.all([
      renderIssue(ctx, key, { comments: 5, include: [], org: args.org, descriptionLength: Infinity }),
      schemaMap(ctx, projectKeyOf(key), args.org),
    ]);
    return {
      resources: [
        { uri: `issue://${key}`, markdown: issue },
        { uri: `project://${projectKeyOf(key)}`, markdown: schema },
      ],
      text: join(
        `Triage ${key}. Its details and the project's values are attached.${orgNote(args.org)}`,
        [
          '1. If the issue may already exist, run search_issues for its key terms (include resolved issues) and name any likely duplicate first.',
          '2. Propose, each with one line of reasoning from the issue text: **Type**, **Priority**, **Tags** (existing tags where they fit; a new one only when none does), **Assignee** (someone assignable in the project, from recent similar issues if search shows a pattern).',
          '3. Show the proposal as a short table and ask me to confirm or adjust.',
          '4. Change nothing until I confirm. Then apply it all in one update_issue call, and add a comment with add_comment only if I ask.',
        ].join('\n'),
      ),
    };
  },
});

export const findDuplicates = definePrompt({
  name: 'find-duplicates',
  title: 'Find duplicates',
  description: 'Searches for issues like one you are about to file, before you file it.',
  input: z.strictObject({
    project,
    title: text('The title you would give the new issue.'),
    description: text('What it is about.').optional(),
    org,
  }),
  async build(_ctx, args) {
    return {
      text: join(
        `Before I file a new issue in ${args.project.toUpperCase()}, find existing ones that describe the same problem.${orgNote(args.org)}`,
        `Title: ${args.title}${args.description ? `\nDescription: ${args.description}` : ''}`,
        [
          `1. Run search_issues two or three times with different key terms from the title and description, in project ${args.project.toUpperCase()}, without #Unresolved so fixed issues count too. Free text matches titles, descriptions and comments.`,
          '2. Read the closest candidates with get_issue.',
          '3. Answer with a ranked list: key, title, status, and one line on why it is or is not the same problem.',
          '4. Recommend one of: comment on an existing issue, link the new one as "duplicates", or file it new. Create or change nothing yourself.',
        ].join('\n'),
      ),
    };
  },
});

export const standupSummary = definePrompt({
  name: 'standup-summary',
  title: 'Standup summary',
  description:
    'What a person (default you) or a project changed since a date: done, in progress, blocked, and time logged - and, for you, what is waiting on you.',
  input: z.strictObject({
    user: text('"me", "@casey" or a full name. Default me.').optional(),
    since: text(
      'A date or a period the query language takes, e.g. "Yesterday" or "2026-09-21". Default Yesterday.',
    ).optional(),
    project: project.optional(),
    org,
  }),
  async build(_ctx, args) {
    const who = args.user?.trim() || 'me';
    const since = args.since?.trim() || 'Yesterday';
    const scope = args.project ? `project: ${args.project.toUpperCase()} ` : '';
    const range = /\s/.test(since) ? `{${since}}` : since;
    return {
      text: join(
        `Write a standup summary for ${who} covering ${since} until now.${orgNote(args.org)}`,
        [
          `1. Run search_issues with \`${scope}updated by: ${who} updated: ${range} .. Today sort by: updated desc\`, and also \`${scope}assignee: ${who} #Unresolved\` for what is still open.`,
          '2. For each issue changed, read get_issue_activity to see what this person actually did: status moves, comments, time logged.',
          '3. Answer in three short sections - Done, In progress, Blocked or waiting - one line per issue with its key, then the total time they logged.',
          ...(who === 'me'
            ? [
                '4. Then run list_notifications with `unread_only: true` and `kind: ["mentioned", "assigned", "due_soon", "overdue"]`, and add a fourth section, Waiting on you: one line per issue with its key and what is asked. Do not mark anything read.',
              ]
            : []),
          `${who === 'me' ? 5 : 4}. Only report what the history shows. Change nothing.`,
        ].join('\n'),
      ),
    };
  },
});

export const writeReleaseNotes = definePrompt({
  name: 'write-release-notes',
  title: 'Write release notes',
  description:
    'Turns the issues resolved in a project over a date range (or matching a query) into user-facing release notes.',
  input: z.strictObject({
    project,
    since: text('First day, YYYY-MM-DD or a period such as "Last month".').optional(),
    until: text('Last day, YYYY-MM-DD. Default Today.').optional(),
    query: text('Instead of dates: a query selecting the issues, e.g. `tag: release-2.4`.').optional(),
    org,
  }),
  async build(_ctx, args) {
    const key = args.project.toUpperCase();
    const brace = (v: string) => (/\s/.test(v) ? `{${v}}` : v);
    const selection = args.query
      ? `project: ${key} #Resolved ${args.query}`
      : `project: ${key} #Resolved resolved date: ${brace(args.since ?? 'Last month')} .. ${brace(args.until ?? 'Today')}`;
    return {
      text: join(
        `Write release notes for ${key}.${orgNote(args.org)}`,
        [
          `1. Run search_issues with \`${selection} sort by: type\`, paging with offset until every issue is in.`,
          '2. Read an issue with get_issue only where its title does not say what changed for users.',
          '3. Group by type - new, improved, fixed - and write one plain sentence per change, for the people who use the product rather than the team. Mention an issue key in brackets at the end of each line.',
          '4. Leave out purely internal work (refactors, CI, tests) unless it changes behaviour. Change nothing in the tracker.',
        ].join('\n'),
      ),
    };
  },
});

export const estimateBacklog = definePrompt({
  name: 'estimate-backlog',
  title: 'Estimate the backlog',
  description:
    'Suggests an Estimation and story points for unestimated issues from the time and points similar resolved issues actually took.',
  input: z.strictObject({
    project,
    query: text('Which issues to estimate. Default: unresolved ones with no estimation.').optional(),
    org,
  }),
  async build(_ctx, args) {
    const key = args.project.toUpperCase();
    const target = args.query ?? `project: ${key} #Unresolved has: -estimation`;
    return {
      text: join(
        `Suggest estimates for issues in ${key}.${orgNote(args.org)}`,
        [
          `1. Run search_issues with \`${target}\` to list the issues to estimate.`,
          `2. Run search_issues with \`project: ${key} #Resolved has: spent time sort by: resolved date desc\` to find finished work, and read the spent time and estimation of the ones most like each open issue.`,
          '3. For each open issue, propose an Estimation as a duration such as "4h" or "2d", and story points on the scale the resolved issues use, naming the one to three resolved issues it is based on and their spent time and points. Say "no basis" where nothing is similar rather than guessing.',
          '4. Show the proposals as a table and ask me to confirm. Only then write each confirmed one with update_issue estimate and story_points.',
        ].join('\n'),
      ),
    };
  },
});

export const sprintReport = definePrompt({
  name: 'sprint-report',
  title: 'Sprint report',
  description:
    "A narrative of a sprint's progress and risks: goal, days left, committed against done, scope added after the start, the burndown trend and the issues at risk.",
  input: z.strictObject({
    project,
    sprint: text('Sprint name or slug. Default the active sprint.').optional(),
    org,
  }),
  async build(ctx, args) {
    const key = args.project.toUpperCase();
    const sprint = args.sprint?.trim() || (await activeSprintSlug(ctx, key, args.org));
    if (!sprint) {
      return {
        text: `${key} has no active sprint. Ask me which sprint to report on; list_sprints shows them.${orgNote(args.org)}`,
      };
    }
    const markdown = await renderSprint(ctx, key, sprint, args.org);
    return {
      resources: [{ uri: `sprint://${key}/${sprint}`, markdown }],
      text: join(
        `Write a sprint report for ${key}, sprint ${sprint}. The sprint, its burndown series and its issues are attached.${orgNote(args.org)}`,
        [
          '1. Open with the goal and one sentence on whether the sprint is on track, judged from days left against the share of points (or issues, when nothing is pointed) resolved and the burndown trend.',
          `2. Scope: run search_issues with \`project: ${key} sprint: {${sprint}}\` and read get_issue_activity for issues whose history shows a sprint change after the sprint started — those were added mid-sprint. Say how many and how many points.`,
          '3. At risk: unresolved issues that are high priority, overdue, unassigned, or still in a not-started status with few days left. One line each, with its key and why.',
          '4. Finish with two or three concrete suggestions (move something out, reassign, split). Keep the whole report under a page. Change nothing in the tracker.',
        ].join('\n'),
      ),
    };
  },
});

export const documentThis = definePrompt({
  name: 'document-this',
  title: 'Document this',
  description:
    'Turns a resolved issue, or a cluster of them, into a draft knowledge base article: a runbook, a root-cause write-up or a how-to.',
  input: z.strictObject({
    issues: text('One or more issue keys, comma-separated, e.g. "PP-12, PP-15".'),
    project: text('Project key for the article. Default: the first issue’s project.').optional(),
    parent: text('An article to put it under, by slug or title.').optional(),
    org,
  }),
  async build(ctx, args) {
    const keys = [
      ...new Set(
        args.issues
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(issueKey),
      ),
    ].slice(0, 10);
    const key = args.project?.trim().toUpperCase() || projectKeyOf(keys[0] ?? '');
    const rendered = await Promise.all(
      keys.map(k => renderIssue(ctx, k, { comments: 20, include: [], org: args.org, descriptionLength: Infinity })),
    );
    return {
      resources: keys.map((k, i) => ({ uri: `issue://${k}`, markdown: rendered[i]! })),
      text: join(
        `Write a knowledge base article in ${key} from ${keys.join(', ')}. The issues, with their comments, are attached.${orgNote(args.org)}`,
        [
          `1. Run search_articles with \`project: ${key}\` and a few of the issues' key words, so you add to what exists rather than repeat it. If an article already covers this, say so and propose an update_article instead.`,
          '2. Choose the shape the material fits - a runbook (symptoms, diagnosis, fix, prevention), a root-cause write-up (what happened, impact, cause, what changed) or a how-to - and draft it in markdown with headings. Cite each issue by its key (PP-12) where it is the source, so the issue lists the article under Referenced by. Leave out names of customers and anything that reads as blame.',
          `3. Propose a title${args.parent ? `, placed under "${args.parent}"` : ' and, from list_articles, where it belongs in the tree'}, and tags: the issues' own tags where they fit (list_tags with for: "articles" shows those in use).`,
          '4. Show me the draft and ask me to confirm. Change nothing until I do; then call create_article once, as a draft, with the title, body, parent and tags.',
        ].join('\n'),
      ),
    };
  },
});

async function activeSprintSlug(ctx: ToolContext, key: string, org: string | undefined) {
  const { data } = await ctx.api.get<Sprint[]>(`/v1/projects/${encodeURIComponent(key)}/sprints`, {
    ...(org ? { org } : {}),
    query: { state: 'active' },
  });
  return data[0]?.slug;
}

export const whyDidItChange = definePrompt({
  name: 'why-did-it-change',
  title: 'Why did it change',
  description:
    "Explains an issue's recent changes, most of all the ones an automation made: which rule, and what fired it.",
  input: z.strictObject({ issue: text('Issue key, e.g. "PP-12".'), org }),
  async build(_ctx, args) {
    const key = issueKey(args.issue);
    return {
      text: join(
        `Explain why ${key} looks the way it does now.${orgNote(args.org)}`,
        [
          `1. Read get_issue_activity for ${key}. A change made by an automation names the rule and what fired it ("because acme/web#42 was merged by @alex").`,
          `2. For each automated change, run list_automation_runs for ${key}'s project with \`issue: "${key}"\`, and list_automations to quote the rule's sentence.`,
          `3. Run get_issue_development for ${key} when a pull request, branch or commit is the cause, to say where it stands now.`,
          '4. Answer as a short timeline, newest first: when, who or which rule, what changed, and why. Say plainly when a rule looked at the issue and left it alone, and why.',
          '5. Change nothing. If a rule did something unwanted, say which one and that a Project Admin can turn it off with update_automation.',
        ].join('\n'),
      ),
    };
  },
});

export const PROMPTS = [
  triageIssue,
  findDuplicates,
  standupSummary,
  writeReleaseNotes,
  estimateBacklog,
  sprintReport,
  documentThis,
  whyDidItChange,
] as const;
