import { initSegmented } from '@scripts/segmented';

const VIEW_NAMES: Record<string, string> = {
  list: 'the issue list',
  detail: 'the issue page',
  history: 'the history',
};

function initViews(): void {
  const group = document.querySelector<HTMLElement>('[data-it-views]');
  const status = document.querySelector<HTMLElement>('[data-it-views-status]');
  const views = [...document.querySelectorAll<HTMLElement>('[data-it-view]')];
  if (!group) return;

  initSegmented(group, value => {
    views.forEach(view => view.classList.toggle('on', view.dataset.itView === value));
    if (status) status.textContent = `Showing ACME-12 in ${VIEW_NAMES[value] ?? value}.`;
  });
}

function initSeverity(): void {
  const group = document.querySelector<HTMLElement>('[data-it-severity]');
  if (!group) return;
  const values = [...document.querySelectorAll<HTMLElement>('[data-it-severity-value]')];
  const row = document.querySelector<HTMLElement>('[data-it-severity-row]');
  const count = document.querySelector<HTMLElement>('[data-it-severity-count]');
  const status = document.querySelector<HTMLElement>('[data-it-severity-status]');
  const otherMatches = Number(count?.dataset.others ?? '0');

  initSegmented(group, value => {
    values.forEach(element => {
      element.textContent = value;
      element.dataset.sev = value;
    });
    const matches = value === 'Critical';
    if (row) row.hidden = !matches;
    const total = otherMatches + (matches ? 1 : 0);
    const label = `${total} ${total === 1 ? 'issue' : 'issues'}`;
    if (count) count.textContent = label;
    if (status) {
      status.textContent = `ACME-12 Severity is ${value}. severity: Critical finds ${label}${matches ? '' : ', without ACME-12'}.`;
    }
  });
}

initViews();
initSeverity();
