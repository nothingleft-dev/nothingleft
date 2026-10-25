import { z } from 'zod';
import { STATUS_CATEGORIES } from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

// The catalogue: a fixed set of triggers, conditions and actions, each a sentence. Not a rules engine.
export const AUTOMATION_TRIGGERS = [
  'git.branch_created',
  'git.commit_pushed',
  'git.pull_request_opened',
  'git.pull_request_ready',
  'git.pull_request_merged',
  'git.pull_request_closed',
  'git.revert_merged',
  'issue.children_resolved',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export const AUTOMATION_ACTIONS = ['issue.set_status'] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];
export const AUTOMATION_RUN_RESULTS = ['applied', 'skipped', 'failed'] as const;
export type AutomationRunResult = (typeof AUTOMATION_RUN_RESULTS)[number];
export const AUTOMATION_SKIP_REASONS = [
  'already_in_status',
  'condition_not_met',
  'archived_project',
  'status_missing',
] as const;
export type AutomationSkipReason = (typeof AUTOMATION_SKIP_REASONS)[number];

const names = z.array(z.string().trim().min(1).max(100)).min(1).max(50);
const common = {
  issue_status_category: z.array(z.enum(STATUS_CATEGORIES)).min(1).optional(),
  issue_type: names.optional(),
};

export const AUTOMATION_CONDITIONS = {
  'git.branch_created': z.strictObject({ ...common }),
  'git.commit_pushed': z.strictObject({
    ...common,
    to_default_branch: z.boolean().optional(),
    intent: z.enum(['closes', 'any']).optional(),
  }),
  'git.pull_request_opened': z.strictObject({ ...common, draft: z.enum(['yes', 'no', 'any']).optional() }),
  'git.pull_request_ready': z.strictObject({ ...common }),
  'git.pull_request_merged': z.strictObject({
    ...common,
    base_branch: z.array(z.string().trim().min(1).max(255)).min(1).max(20).optional(),
    intent: z
      .array(z.enum(['closes', 'mention']))
      .min(1)
      .optional(),
    all_linked_merged: z.boolean().optional(),
  }),
  'git.pull_request_closed': z.strictObject({ ...common, no_other_open_prs: z.boolean().optional() }),
  'git.revert_merged': z.strictObject({ ...common }),
  'issue.children_resolved': z.strictObject({
    ...common,
    child_count_min: z.number().int().min(1).max(500).optional(),
  }),
} as const satisfies Record<AutomationTrigger, z.ZodObject>;

export const AUTOMATION_ACTION_PARAMS = {
  'issue.set_status': z.strictObject({ status: z.string().trim().min(1).max(100) }),
} as const satisfies Record<AutomationAction, z.ZodObject>;

export type AutomationConditions = { [K in AutomationTrigger]: z.infer<(typeof AUTOMATION_CONDITIONS)[K]> };
export const AUTOMATIONS_PER_PROJECT_MAX = 100;
// Templates that want a status by name rather than by category; the seeded set has no In Review.
export const AUTOMATION_TEMPLATE_STATUSES = { review: 'In Review', reopen_on_revert: 'Reopened' } as const;
export const AUTOMATION_RUNS_RETENTION_DAYS = 90;

export const AutomationSchema = z.object({
  name: z.string(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z.record(z.string(), z.unknown()),
  action: z.enum(AUTOMATION_ACTIONS),
  action_params: z.record(z.string(), z.unknown()),
  is_enabled: z.boolean(),
  position: z.number().int(),
  // The rule as one sentence: "When a pull request is merged into main … then set status to Fixed."
  sentence: z.string(),
  // Its status no longer exists in the project: every run skips until it is pointed at another.
  status_missing: z.boolean(),
  last_run_at: z.string().nullable(),
  // Runs in the last 90 days, the window runs are kept for.
  runs: z.number().int().nonnegative(),
  created_by: MemberRefSchema.nullable(),
  updated_by: MemberRefSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Automation = z.infer<typeof AutomationSchema>;

const NameSchema = z.string().trim().min(1).max(100);

export const CreateAutomationSchema = z.object({
  // Filled from the sentence when left out.
  name: NameSchema.optional(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z.record(z.string(), z.unknown()).default({}),
  action: z.enum(AUTOMATION_ACTIONS),
  action_params: z.record(z.string(), z.unknown()),
  is_enabled: z.boolean().default(true),
  position: z.number().int().min(0).max(AUTOMATIONS_PER_PROJECT_MAX).optional(),
});
export type CreateAutomation = z.infer<typeof CreateAutomationSchema>;

export const UpdateAutomationSchema = z.object({
  name: NameSchema.optional(),
  trigger: z.enum(AUTOMATION_TRIGGERS).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  action: z.enum(AUTOMATION_ACTIONS).optional(),
  action_params: z.record(z.string(), z.unknown()).optional(),
  is_enabled: z.boolean().optional(),
  position: z.number().int().min(0).max(AUTOMATIONS_PER_PROJECT_MAX).optional(),
});
export type UpdateAutomation = z.infer<typeof UpdateAutomationSchema>;

export const AutomationRunSchema = z.object({
  id: z.number().int(),
  automation: z.string(),
  issue: z.string(),
  result: z.enum(AUTOMATION_RUN_RESULTS),
  reason: z.enum(AUTOMATION_SKIP_REASONS).nullable(),
  // {"status": {"from": "In Progress", "to": "Fixed"}} when applied.
  changes: z.record(z.string(), z.unknown()).nullable(),
  // What fired it, in words: "acme/web#42 merged by @alex".
  cause: z.string(),
  trigger_ref: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export type AutomationRun = z.infer<typeof AutomationRunSchema>;

export const AutomationRunsQuerySchema = z.object({
  issue: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AutomationRunsQuery = z.infer<typeof AutomationRunsQuerySchema>;

export const TestAutomationSchema = z.object({ issue: z.string().trim().min(1).max(40) });
export type TestAutomation = z.infer<typeof TestAutomationSchema>;

// A dry run: what the rule would do to that issue now, if its trigger fired.
export const AutomationTestResultSchema = z.object({
  result: z.enum(['would_apply', 'would_skip']),
  reason: z.enum(AUTOMATION_SKIP_REASONS).nullable(),
  changes: z.record(z.string(), z.unknown()).nullable(),
  sentence: z.string(),
});
export type AutomationTestResult = z.infer<typeof AutomationTestResultSchema>;

export const AutomationCatalogueSchema = z.object({
  triggers: z.array(
    z.object({
      key: z.enum(AUTOMATION_TRIGGERS),
      group: z.enum(['git', 'hierarchy']),
      label: z.string(),
      // JSON Schema of its conditions, from which the editor draws its rows.
      conditions: z.record(z.string(), z.unknown()),
      // What a condition left out means.
      defaults: z.record(z.string(), z.unknown()),
    }),
  ),
  actions: z.array(
    z.object({
      key: z.enum(AUTOMATION_ACTIONS),
      label: z.string(),
      params: z.record(z.string(), z.unknown()),
    }),
  ),
  conditions: z.record(z.string(), z.string()),
});
export type AutomationCatalogue = z.infer<typeof AutomationCatalogueSchema>;

export const AutomationTemplateSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  // Ready to POST; `action_params.status` is the project's first fitting status, or null when it has none.
  automation: CreateAutomationSchema.extend({ action_params: z.object({ status: z.string().nullable() }) }),
  // The status the template wants does not exist yet (there is no seeded "In Review").
  needs_status: z.boolean(),
});
export type AutomationTemplate = z.infer<typeof AutomationTemplateSchema>;
