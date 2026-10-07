export type MarketingEvent =
  | { name: 'demo_played'; trigger: 'visible' | 'replay' | 'watch_link' }
  | { name: 'demo_step_selected'; step: number }
  | { name: 'workflow_step_selected'; step: number };

// Sends nothing until packages/analytics is wired. Rule 11: event names, IDs and counts only, never page text.
export function track(_event: MarketingEvent): void {}
