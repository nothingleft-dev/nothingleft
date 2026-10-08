import { track } from '@lib/analytics';

function initWalkthrough(): void {
  const group = document.querySelector<HTMLElement>('[data-ja-steps]');
  if (!group) return;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-ja-step]')];
  const views = [...document.querySelectorAll<HTMLElement>('#ja-panel [data-view]')];
  const status = document.querySelector<HTMLElement>('[data-ja-status]');
  const nav = document.querySelector<HTMLElement>('[data-ja-nav]');
  const prev = nav?.querySelector<HTMLButtonElement>('[data-ja-prev]');
  const next = nav?.querySelector<HTMLButtonElement>('[data-ja-next]');
  let current = 0;

  const select = (index: number, announce = true) => {
    const button = buttons[index];
    if (!button) return;
    current = index;
    buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === button.dataset.jaStep));
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index === buttons.length - 1;
    if (!announce) return;
    if (status) status.textContent = `Step ${index + 1} of ${buttons.length}: ${button.dataset.jaTitle ?? ''}.`;
    track({ name: 'workflow_step_selected', step: index + 1 });
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      let target: number | undefined;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = (index + 1) % buttons.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = buttons.length - 1;
      if (target === undefined) return;
      event.preventDefault();
      buttons[target]?.focus();
      select(target);
    });
  });

  // A button that disables itself would drop focus to the page, so hand it to its partner.
  prev?.addEventListener('click', () => {
    select(Math.max(0, current - 1));
    if (prev.disabled) next?.focus();
  });
  next?.addEventListener('click', () => {
    select(Math.min(buttons.length - 1, current + 1));
    if (next.disabled) prev?.focus();
  });
  if (nav) nav.hidden = false;
  select(0, false);
}

initWalkthrough();
