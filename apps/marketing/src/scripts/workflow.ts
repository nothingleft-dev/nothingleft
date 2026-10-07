import { track } from '@lib/analytics';

export function initWorkflow(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-wf]')];
  const views = [...document.querySelectorAll<HTMLElement>('#wf-panel [data-view]')];
  if (buttons.length === 0) return;

  const select = (step: string) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wf === step)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === step));
    track({ name: 'workflow_step_selected', step: Number(step) });
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.wf ?? '1'));
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
      select(target.dataset.wf ?? '1');
    });
  });
}
