import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  AUTOMATION_ACTION_PARAMS,
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITIONS,
  AUTOMATION_TEMPLATE_STATUSES,
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationCatalogue,
  type AutomationTemplate,
  type AutomationTrigger,
  type StatusCategory,
} from '@nothingleft/types';
import { AppError } from '@lib/errors';

/** What a condition left out means, per trigger. */
export const CONDITION_DEFAULTS: Record<AutomationTrigger, Record<string, unknown>> = {
  'git.branch_created': {},
  'git.commit_pushed': { intent: 'any' },
  'git.pull_request_opened': { draft: 'any' },
  'git.pull_request_ready': {},
  'git.pull_request_merged': { intent: ['closes'], all_linked_merged: true },
  'git.pull_request_closed': { no_other_open_prs: true },
  'git.revert_merged': {},
  'issue.children_resolved': { child_count_min: 1 },
};

const CONDITION_KEYS = [
  'issue_status_category',
  'issue_type',
  'to_default_branch',
  'intent',
  'draft',
  'base_branch',
  'all_linked_merged',
  'no_other_open_prs',
  'child_count_min',
] as const;

export function validateConditions(trigger: AutomationTrigger, conditions: unknown): Record<string, unknown> {
  const parsed = AUTOMATION_CONDITIONS[trigger].safeParse(conditions ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new AppError(
      'automation.condition_invalid',
      422,
      { trigger, detail: `${issue.path.join('.') || 'conditions'}: ${issue.code}` },
      'conditions',
    );
  }
  return parsed.data as Record<string, unknown>;
}

export function validateAction(action: AutomationAction, params: unknown): { status: string } {
  const parsed = AUTOMATION_ACTION_PARAMS[action].safeParse(params ?? {});
  if (!parsed.success) {
    throw new AppError('automation.condition_invalid', 422, { trigger: action, detail: 'status' }, 'action_params');
  }
  return parsed.data;
}

const list = (values: string[]) => values.join(t('automation.or'));

function conditionPhrases(trigger: AutomationTrigger, conditions: Record<string, unknown>): string[] {
  const c = { ...CONDITION_DEFAULTS[trigger], ...conditions };
  const out: string[] = [];
  if (Array.isArray(c['issue_status_category'])) {
    out.push(
      t('automation.condition.issue_status_category', {
        categories: list((c['issue_status_category'] as StatusCategory[]).map(k => t(`automation.category.${k}`))),
      }),
    );
  }
  if (Array.isArray(c['issue_type'])) {
    out.push(t('automation.condition.issue_type', { types: list(c['issue_type'] as string[]) }));
  }
  if (c['to_default_branch'] === true) out.push(t('automation.condition.to_default_branch'));
  if (trigger === 'git.commit_pushed' && c['intent'] === 'closes') out.push(t('automation.condition.intent_closes'));
  if (trigger === 'git.pull_request_merged') {
    const intent = c['intent'] as string[];
    out.push(t(intent.includes('mention') ? 'automation.condition.intent_any' : 'automation.condition.intent_closes'));
  }
  if (c['draft'] === 'yes') out.push(t('automation.condition.draft_yes'));
  if (c['draft'] === 'no') out.push(t('automation.condition.draft_no'));
  if (Array.isArray(c['base_branch'])) {
    out.push(t('automation.condition.base_branch', { branches: list(c['base_branch'] as string[]) }));
  }
  if (c['all_linked_merged'] === true) out.push(t('automation.condition.all_linked_merged'));
  if (trigger === 'git.pull_request_closed' && c['no_other_open_prs'] === true) {
    out.push(t('automation.condition.no_other_open_prs'));
  }
  if (typeof c['child_count_min'] === 'number' && c['child_count_min'] > 1) {
    out.push(t('automation.condition.child_count_min', { count: c['child_count_min'] }));
  }
  return out;
}

/** The rule as one sentence, everywhere it shows: the list, MCP, the run log. */
export function sentenceOf(
  trigger: AutomationTrigger,
  conditions: Record<string, unknown>,
  action: AutomationAction,
  params: Record<string, unknown>,
): string {
  const phrases = conditionPhrases(trigger, conditions);
  return t('automation.sentence', {
    trigger: t(`automation.trigger.${trigger}`),
    conditions: phrases.length ? t('automation.conditions.lead') + phrases.join(t('automation.conditions.joiner')) : '',
    action: t(`automation.action.${action}`, { status: String(params['status'] ?? '') }),
  });
}

export function catalogue(): AutomationCatalogue {
  return {
    triggers: AUTOMATION_TRIGGERS.map(key => ({
      key,
      group: key.startsWith('git.') ? ('git' as const) : ('hierarchy' as const),
      label: t(`automation.label.${key}`),
      conditions: z.toJSONSchema(AUTOMATION_CONDITIONS[key], { io: 'input' }) as Record<string, unknown>,
      defaults: CONDITION_DEFAULTS[key],
    })),
    actions: AUTOMATION_ACTIONS.map(key => ({
      key,
      label: t(`automation.action_label.${key}`),
      params: z.toJSONSchema(AUTOMATION_ACTION_PARAMS[key], { io: 'input' }) as Record<string, unknown>,
    })),
    conditions: Object.fromEntries(
      CONDITION_KEYS.map(k => [k, t(`automation.condition_label.${k}` as Parameters<typeof t>[0])]),
    ),
  };
}

interface StatusChoice {
  name: string;
  category: StatusCategory;
}

/** The starting rules, with this project's first fitting status filled in. Offered, never created unasked. */
export function templates(statuses: readonly StatusChoice[]): AutomationTemplate[] {
  const first = (category: StatusCategory) => statuses.find(s => s.category === category)?.name ?? null;
  const named = (name: string) => statuses.find(s => s.name.toLowerCase() === name.toLowerCase())?.name ?? null;
  const make = (
    key: 'start_work' | 'review' | 'close_on_merge' | 'reopen_on_revert' | 'resolve_parent',
    trigger: AutomationTrigger,
    conditions: Record<string, unknown>,
    status: string | null,
  ): AutomationTemplate => ({
    key,
    name: t(`automation.template.${key}.name`),
    description: t(`automation.template.${key}.description`),
    automation: {
      name: t(`automation.template.${key}.name`),
      trigger,
      conditions,
      action: 'issue.set_status',
      action_params: { status },
      is_enabled: true,
    },
    needs_status: status === null,
  });
  return [
    make('start_work', 'git.branch_created', { issue_status_category: ['backlog', 'unstarted'] }, first('started')),
    make(
      'review',
      'git.pull_request_ready',
      { issue_status_category: ['backlog', 'unstarted', 'started'] },
      named(AUTOMATION_TEMPLATE_STATUSES.review),
    ),
    make('close_on_merge', 'git.pull_request_merged', { intent: ['closes'], all_linked_merged: true }, first('done')),
    make(
      'reopen_on_revert',
      'git.revert_merged',
      { issue_status_category: ['done'] },
      named(AUTOMATION_TEMPLATE_STATUSES.reopen_on_revert),
    ),
    make('resolve_parent', 'issue.children_resolved', {}, first('done')),
  ];
}
