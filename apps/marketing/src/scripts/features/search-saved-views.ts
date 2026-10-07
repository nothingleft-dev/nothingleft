import {
  DEFAULT_STATE,
  PRIORITIES,
  TYPE_CHOICES,
  countLabel,
  issuesAddress,
  perAssignee,
  reportAddress,
  runQuery,
  viewName,
  type BuilderState,
  type Priority,
  type TypeChoice,
} from '@lib/features/search-saved-views';
import { initSegmented } from '@scripts/segmented';

function pick<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`${selector} is missing from the search page markup`);
  return found;
}

function initFlow(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-sv-step]')];
  const views = [...document.querySelectorAll<HTMLElement>('#sv-flow-panel [data-view]')];
  if (buttons.length === 0) return;

  const select = (step: string) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.svStep === step)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === step));
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.svStep ?? '1'));
    button.addEventListener('keydown', event => {
      let next: number | undefined;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      const target = next === undefined ? undefined : buttons[next];
      if (!target) return;
      event.preventDefault();
      target.focus();
      select(target.dataset.svStep ?? '1');
    });
  });
}

const isTypeChoice = (value: string): value is TypeChoice => (TYPE_CHOICES as readonly string[]).includes(value);
const isPriority = (value: string): value is Priority => (PRIORITIES as readonly string[]).includes(value);

function initBuilder(): void {
  const root = document.getElementById('sv-builder');
  if (!root) return;

  const state: BuilderState = { ...DEFAULT_STATE, priorities: [...DEFAULT_STATE.priorities] };

  const typeGroup = pick(root, '[data-sv-group="type"]');
  const assigneeGroup = pick(root, '[data-sv-group="assignee"]');
  const assigneeOptions = [...assigneeGroup.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const priorityChips = [...root.querySelectorAll<HTMLButtonElement>('[data-priority]')];
  const unresolvedChip = pick<HTMLButtonElement>(root, '[data-unresolved]');
  const head = pick(root, '[data-q-head]');
  const bad = pick(root, '[data-q-bad]');
  const count = pick(root, '#sv-count');
  const problem = pick(root, '[data-problem]');
  const problemMessage = pick(root, '[data-problem-message]');
  const rows = [...root.querySelectorAll<HTMLElement>('[data-rows] [data-issue]')];
  const empty = pick(root, '[data-empty]');
  const address = pick(root, '[data-address]');
  const viewOk = pick(root, '[data-view-ok]');
  const viewRefused = pick(root, '[data-view-refused]');
  const viewNameEl = pick(root, '[data-view-name]');
  const viewRef = pick(root, '[data-view-ref]');
  const report = pick(root, '[data-report]');
  const reportRows = [...report.querySelectorAll<HTMLElement>('[data-bucket]')];
  const reportAddressEl = pick(root, '[data-report-address]');
  const reportRefused = pick(root, '[data-report-refused]');
  const agent = pick(root, '[data-agent]');
  const status = pick(root, '[data-status]');

  const syncAssignee = () => {
    const checked = assigneeOptions.find(option => option.dataset.value === state.assignee);
    assigneeOptions.forEach(option => {
      option.setAttribute('aria-checked', String(option === checked));
      option.tabIndex = option === (checked ?? assigneeOptions[0]) ? 0 : -1;
    });
  };

  const render = (announce = true) => {
    const result = runQuery(state);
    const refused = result.problem;

    if (refused) {
      head.textContent = result.query.slice(0, result.query.length - refused.value.length);
      bad.textContent = refused.value;
      problemMessage.textContent = refused.message;
    } else {
      head.textContent = result.query;
      bad.textContent = '';
    }
    bad.hidden = !refused;
    problem.hidden = !refused;
    count.textContent = refused ? 'Refused' : countLabel(result.issues.length);

    const matched = new Set(result.issues.map(issue => issue.key));
    rows.forEach(row => (row.hidden = !matched.has(row.dataset.issue ?? '')));
    empty.hidden = Boolean(refused) || result.issues.length > 0;

    address.textContent = issuesAddress(result.query);

    const name = viewName(state);
    viewOk.hidden = Boolean(refused);
    viewRefused.hidden = !refused;
    viewNameEl.textContent = name;
    viewRef.textContent = `#{${name}}`;

    const buckets = perAssignee(result.issues);
    const most = Math.max(1, ...buckets.map(bucket => bucket.count));
    reportRows.forEach(row => {
      const bucket = buckets.find(candidate => (candidate.bucket ?? 'none') === row.dataset.bucket);
      const value = bucket?.count ?? 0;
      row.hidden = Boolean(refused) || value === 0;
      pick(row, '.num').textContent = String(value);
      pick(row, '.fill').style.width = `${(value / most) * 100}%`;
    });
    report.hidden = Boolean(refused) || result.issues.length === 0;
    reportAddressEl.textContent = reportAddress(result.query);
    reportAddressEl.hidden = Boolean(refused);
    reportRefused.hidden = !refused;

    agent.textContent = refused
      ? `query.invalid_value, valid_values: ${refused.validValues.join(', ')}`
      : `query: ${result.query}`;

    if (!announce) return;
    status.textContent = refused
      ? `Refused. ${refused.message} Valid values: ${refused.validValues.join(', ')}.`
      : `${countLabel(result.issues.length)} for ${result.query || 'an empty query'}.`;
  };

  initSegmented(typeGroup, value => {
    if (isTypeChoice(value)) state.type = value;
    render();
  });
  initSegmented(assigneeGroup, value => {
    state.assignee = value;
    render();
  });

  priorityChips.forEach(chip =>
    chip.addEventListener('click', () => {
      const priority = chip.dataset.priority ?? '';
      if (!isPriority(priority)) return;
      const on = !state.priorities.includes(priority);
      state.priorities = on ? [...state.priorities, priority] : state.priorities.filter(p => p !== priority);
      chip.setAttribute('aria-pressed', String(on));
      render();
    }),
  );

  unresolvedChip.addEventListener('click', () => {
    state.unresolved = !state.unresolved;
    unresolvedChip.setAttribute('aria-pressed', String(state.unresolved));
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach(fix =>
    fix.addEventListener('click', () => {
      state.assignee = fix.dataset.fix ?? 'anyone';
      syncAssignee();
      render();
      (assigneeOptions.find(option => option.tabIndex === 0) ?? unresolvedChip).focus();
    }),
  );

  render(false);
}

initFlow();
initBuilder();
