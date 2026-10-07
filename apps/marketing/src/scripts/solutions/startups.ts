import { initSegmented } from '@scripts/segmented';

const DEFAULT_NAMES: Record<string, string> = {
  statuses: 'the default statuses',
  priorities: 'the default priorities',
  types: 'the default issue types',
  board: 'the default board',
  'work-types': 'the default work types',
};

function initFirstRun(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-su-step]')];
  const views = [...document.querySelectorAll<HTMLElement>('#su-panel [data-view]')];
  const status = document.querySelector<HTMLElement>('[data-su-status]');
  if (buttons.length === 0) return;

  const select = (step: string) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.suStep === step)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === step));
    const title = buttons.find(button => button.dataset.suStep === step)?.querySelector('b')?.textContent;
    if (status && title) status.textContent = `Step ${step} of ${buttons.length}: ${title}.`;
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.suStep ?? '1'));
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
      select(target.dataset.suStep ?? '1');
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-su-next]').forEach(next => {
    next.addEventListener('click', () => {
      const step = next.dataset.suNext ?? '1';
      select(step);
      buttons.find(button => button.dataset.suStep === step)?.focus({ preventScroll: true });
    });
  });
}

function initDefaults(): void {
  const group = document.querySelector<HTMLElement>('[data-su-defaults]');
  const status = document.querySelector<HTMLElement>('[data-su-defaults-status]');
  const views = [...document.querySelectorAll<HTMLElement>('[data-su-default]')];
  if (!group) return;

  initSegmented(group, value => {
    views.forEach(view => view.classList.toggle('on', view.dataset.suDefault === value));
    if (status) status.textContent = `Showing ${DEFAULT_NAMES[value] ?? value}.`;
  });
}

initFirstRun();
initDefaults();
