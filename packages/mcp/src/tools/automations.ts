import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  AUTOMATION_TRIGGERS,
  type Automation,
  type AutomationCatalogue,
  type AutomationRun,
  type AutomationTemplate,
  type AutomationTestResult,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { defineTool } from '../tool.ts';
import { code, facts, instant, join, more, table } from '../render.ts';
import { issueKey } from '../resolve.ts';

const automationArg = z.string().trim().min(1).max(100).describe('The automation by name, e.g. "Close on merge".');
const statusArg = z.string().trim().min(1).max(100).describe('The status it sets, by name, e.g. "Fixed".');
const conditionsArg = z
  .record(z.string(), z.unknown())
  .describe('Trigger conditions, e.g. {"base_branch": ["main"]}; list_automations include: "catalogue" lists them.');

const scope = (org: string | undefined) => (org ? { org } : {});
const SKIPPED: Record<string, string> = {
  already_in_status: 'already in that status',
  condition_not_met: 'a condition did not hold',
  archived_project: 'the project is archived',
  status_missing: 'its status no longer exists',
};

function rulesTable(rules: Automation[], zone: string): string {
  return table(
    ['Automation', 'Rule', 'On', 'Runs (90 days)', 'Last run'],
    rules.map(r => [
      code(r.name),
      r.sentence + (r.status_missing ? ' **(status missing: every run skips)**' : ''),
      r.is_enabled ? 'yes' : 'off',
      String(r.runs),
      r.last_run_at ? instant(r.last_run_at, zone) : 'never',
    ]),
  );
}

export const listAutomations = defineTool({
  name: 'list_automations',
  title: 'List automations',
  description:
    'A project\'s automation rules in run order, one sentence each, with state and run counts. `automation` shows one with its conditions; `include` adds "templates" or the trigger "catalogue".',
  input: z.strictObject({
    project: arg.project,
    automation: automationArg.optional(),
    include: z.enum(['templates', 'catalogue']).optional().describe('Also show the templates or the catalogue.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: [
    'GET /v1/projects/{key}/automations',
    'GET /v1/projects/{key}/automations/{name}',
    'GET /v1/projects/{key}/automations/templates',
    'GET /v1/automations/catalogue',
  ],
  async run(ctx, args) {
    const zone = await ctx.timeZone();
    const key = args.project.toUpperCase();
    if (args.automation) {
      const { data: rule } = await ctx.api.get<Automation>(
        path`/v1/projects/${key}/automations/${args.automation}`,
        scope(args.org),
      );
      return {
        markdown: join(
          `**${rule.name}** in ${key}${rule.is_enabled ? '' : ' (off)'}`,
          rule.sentence,
          facts([
            ['Trigger', code(rule.trigger)],
            ['Conditions', code(JSON.stringify(rule.conditions))],
            ['Sets status', String(rule.action_params['status'] ?? '')],
            ['Position', String(rule.position)],
            ['Runs (90 days)', String(rule.runs)],
            ['Last run', rule.last_run_at ? instant(rule.last_run_at, zone) : 'never'],
          ]),
          rule.status_missing
            ? 'Its status no longer exists in the project: every run skips until it is pointed at another.'
            : null,
        ),
      };
    }
    const { data } = await ctx.api.get<Automation[]>(path`/v1/projects/${key}/automations`, scope(args.org));
    const parts = [
      data.length
        ? join(`Automations in **${key}**`, rulesTable(data, zone))
        : `${key} has no automations. A Project Admin adds one with create_automation; include: "templates" lists ready-made ones.`,
    ];
    if (args.include === 'templates') {
      const { data: templates } = await ctx.api.get<AutomationTemplate[]>(
        path`/v1/projects/${key}/automations/templates`,
        scope(args.org),
      );
      parts.push(
        join(
          '**Templates** (pass `template` to create_automation)',
          table(
            ['Template', 'What it does', 'Sets'],
            templates.map(tp => [
              code(tp.key),
              tp.description,
              tp.automation.action_params.status ?? 'no fitting status: pass `status`',
            ]),
          ),
        ),
      );
    }
    if (args.include === 'catalogue') {
      const { data: catalogue } = await ctx.api.get<AutomationCatalogue>('/v1/automations/catalogue');
      parts.push(
        join(
          '**Triggers**',
          table(
            ['Trigger', 'When', 'Conditions', 'Defaults'],
            catalogue.triggers.map(tr => [
              code(tr.key),
              tr.label,
              Object.keys((tr.conditions['properties'] as Record<string, unknown> | undefined) ?? {})
                .map(code)
                .join(', ') || '-',
              Object.keys(tr.defaults).length ? code(JSON.stringify(tr.defaults)) : '-',
            ]),
          ),
          `Action: ${catalogue.actions.map(a => `${code(a.key)} (${a.label})`).join(', ')}.`,
        ),
      );
    }
    return { markdown: join(...parts) };
  },
});

export const createAutomation = defineTool({
  name: 'create_automation',
  title: 'Create an automation',
  description:
    "Adds a rule that sets an issue's status on a git event or when its last open subtask resolves. Use a `template`, or `trigger` and `status`. Automations never trigger each other. Project Admin, admin:project; 10 per project on the free plan.",
  input: z.strictObject({
    project: arg.project,
    template: z
      .enum(['start_work', 'review', 'close_on_merge', 'reopen_on_revert', 'resolve_parent'])
      .optional()
      .describe('A ready-made rule; anything else you pass overrides it.'),
    trigger: z.enum(AUTOMATION_TRIGGERS).optional().describe('What fires it; needed without a template.'),
    conditions: conditionsArg.optional(),
    status: statusArg.optional(),
    name: automationArg.optional().describe('Its name; left out, the rule as a sentence names it.'),
    enabled: z.boolean().optional().describe('Off creates it without running it. Default on.'),
    org: arg.org,
  }),
  kind: 'write',
  scopes: ['issues:read', 'admin:project'],
  creates: true,
  endpoints: ['GET /v1/projects/{key}/automations/templates', 'POST /v1/projects/{key}/automations'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    let base: AutomationTemplate['automation'] | undefined;
    if (args.template) {
      const { data } = await ctx.api.get<AutomationTemplate[]>(
        path`/v1/projects/${key}/automations/templates`,
        scope(args.org),
      );
      base = data.find(tp => tp.key === args.template)?.automation;
    }
    const trigger = args.trigger ?? base?.trigger;
    const status = args.status ?? base?.action_params.status;
    if (!trigger || !status) {
      return {
        markdown: !trigger
          ? 'Say what fires it: pass `trigger` or a `template`.'
          : 'This project has no status that fits the template. Pass `status` with the one to set.',
      };
    }
    const { data } = await ctx.api.send<Automation>('POST', path`/v1/projects/${key}/automations`, {
      body: {
        ...((args.name ?? base?.name) ? { name: args.name ?? base?.name } : {}),
        trigger,
        conditions: args.conditions ?? (args.trigger && args.trigger !== base?.trigger ? {} : (base?.conditions ?? {})),
        action: 'issue.set_status',
        action_params: { status },
        is_enabled: args.enabled ?? true,
      },
      ...scope(args.org),
    });
    return {
      markdown: `Created ${code(data.name)} in ${key}${data.is_enabled ? '' : ' (off)'}: ${data.sentence}`,
    };
  },
});

export const updateAutomation = defineTool({
  name: 'update_automation',
  title: 'Update an automation',
  description:
    'Renames a rule, turns it on or off, or changes its conditions, status or position (the first rule that changes an issue wins). Project Admin, admin:project.',
  input: z.strictObject({
    project: arg.project,
    automation: automationArg,
    name: automationArg.optional().describe('A new name.'),
    enabled: z.boolean().optional(),
    conditions: conditionsArg.optional().describe('Replaces its conditions; {} goes back to the defaults.'),
    status: statusArg.optional(),
    position: z.number().int().min(0).max(100).optional().describe('Its place in the order, 0 first.'),
    org: arg.org,
  }),
  kind: 'write',
  scopes: ['issues:read', 'admin:project'],
  endpoints: ['PATCH /v1/projects/{key}/automations/{name}'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const { data } = await ctx.api.send<Automation>('PATCH', path`/v1/projects/${key}/automations/${args.automation}`, {
      body: {
        ...(args.name ? { name: args.name } : {}),
        ...(args.enabled === undefined ? {} : { is_enabled: args.enabled }),
        ...(args.conditions ? { conditions: args.conditions } : {}),
        ...(args.status ? { action_params: { status: args.status } } : {}),
        ...(args.position === undefined ? {} : { position: args.position }),
      },
      ...scope(args.org),
    });
    return { markdown: `Updated ${code(data.name)}${data.is_enabled ? '' : ' (off)'}: ${data.sentence}` };
  },
});

export const deleteAutomation = defineTool({
  name: 'delete_automation',
  title: 'Delete an automation',
  description:
    "Deletes a rule and its run log. What it already changed stays in the issues' history. Needs a Project Admin and a token with admin:project. Asks you to confirm before acting.",
  input: z.strictObject({ project: arg.project, automation: automationArg, org: arg.org }),
  kind: 'destructive',
  scopes: ['issues:read', 'admin:project'],
  endpoints: ['DELETE /v1/projects/{key}/automations/{name}'],
  async describeAction(_ctx, args) {
    return t('mcp.action.automation_delete', { name: args.automation, project: args.project.toUpperCase() });
  },
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const { data } = await ctx.api.send<Automation[]>(
      'DELETE',
      path`/v1/projects/${key}/automations/${args.automation}`,
      scope(args.org),
    );
    return {
      markdown: `Deleted ${code(args.automation)} from ${key}. ${data.length ? `${data.length} automation${data.length === 1 ? '' : 's'} left.` : 'It has no automations now.'}`,
    };
  },
});

export const testAutomation = defineTool({
  name: 'test_automation',
  title: 'Test an automation',
  description:
    'A dry run: what the rule would do to an issue now, were its trigger to fire. Changes nothing. Needs a Project Admin and a token with admin:project.',
  input: z.strictObject({ project: arg.project, automation: automationArg, issue: arg.issue, org: arg.org }),
  kind: 'read',
  scopes: ['issues:read', 'admin:project'],
  endpoints: ['POST /v1/projects/{key}/automations/{name}/test'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const issue = issueKey(args.issue);
    const { data } = await ctx.api.send<AutomationTestResult>(
      'POST',
      path`/v1/projects/${key}/automations/${args.automation}/test`,
      { body: { issue }, ...scope(args.org) },
    );
    const status = data.changes?.['status'] as { from: string; to: string } | undefined;
    return {
      markdown: join(
        data.result === 'would_apply'
          ? `${code(args.automation)} would move ${issue} from **${status?.from}** to **${status?.to}**.`
          : `${code(args.automation)} would leave ${issue} alone: ${SKIPPED[data.reason ?? ''] ?? data.reason}.`,
        `Rule: ${data.sentence}`,
      ),
    };
  },
});

export const listAutomationRuns = defineTool({
  name: 'list_automation_runs',
  title: 'List automation runs',
  description:
    'The run log, newest first: what fired each rule and whether it changed the issue. Narrow by `automation` or `issue`. Kept 90 days.',
  input: z.strictObject({
    project: arg.project,
    automation: automationArg.optional(),
    issue: arg.issue.optional(),
    org: arg.org,
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/automations/{name}/runs', 'GET /v1/projects/{key}/automation-runs'],
  async run(ctx, args) {
    const zone = await ctx.timeZone();
    const key = args.project.toUpperCase();
    const query = {
      ...(args.issue ? { issue: issueKey(args.issue) } : {}),
      limit: args.limit ?? arg.DEFAULT_LIMIT,
      offset: args.offset ?? 0,
    };
    const url = args.automation
      ? path`/v1/projects/${key}/automations/${args.automation}/runs`
      : path`/v1/projects/${key}/automation-runs`;
    const { data, pagination } = await ctx.api.get<AutomationRun[]>(url, { query, ...scope(args.org) });
    if (data.length === 0) return { markdown: 'No runs in the last 90 days.' };
    return {
      markdown: join(
        table(
          ['When', 'Automation', 'Issue', 'Result', 'Because'],
          data.map(r => {
            const status = r.changes?.['status'] as { from: string; to: string } | undefined;
            return [
              instant(r.created_at, zone),
              code(r.automation),
              r.issue,
              r.result === 'applied'
                ? `${status?.from} → ${status?.to}`
                : `${r.result}: ${SKIPPED[r.reason ?? ''] ?? r.reason ?? ''}`,
              // Branch names and logins come from the provider: shown as code, never followed.
              code(r.cause),
            ];
          }),
        ),
        more(pagination, data.length),
      ),
    };
  },
});
