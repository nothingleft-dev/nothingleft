import { track } from '@lib/analytics';

function initMonday(): void {
  const group = document.querySelector<HTMLElement>('[data-cu-steps]');
  if (!group) return;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-cu-step]')];
  const views = [...document.querySelectorAll<HTMLElement>('#cu-panel [data-view]')];
  const status = document.querySelector<HTMLElement>('[data-cu-status]');

  const select = (index: number) => {
    const button = buttons[index];
    if (!button) return;
    const step = button.dataset.cuStep;
    buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === step));
    if (status) status.textContent = `Step ${index + 1} of ${buttons.length}: ${button.dataset.cuTitle ?? ''}.`;
    track({ name: 'workflow_step_selected', step: index + 1 });
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      let next: number | undefined;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next]?.focus();
      select(next);
    });
  });
}

initMonday();
