function initSteps(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-tt-step]')];
  const views = [...document.querySelectorAll<HTMLElement>('#tt-panel [data-view]')];
  if (buttons.length === 0) return;

  const select = (step: string) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ttStep === step)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === step));
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.ttStep ?? '1'));
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
      select(target.dataset.ttStep ?? '1');
    });
  });
}

function initTimesheet(): void {
  const cells = [...document.querySelectorAll<HTMLButtonElement>('[data-ts-cell]')];
  const panels = [...document.querySelectorAll<HTMLElement>('[data-ts-entries]')];
  const empty = document.querySelector<HTMLElement>('[data-ts-empty]');
  if (cells.length === 0) return;

  const show = (cell: HTMLButtonElement | undefined) => {
    const target = cell?.getAttribute('aria-controls');
    cells.forEach(other => other.setAttribute('aria-expanded', String(other === cell)));
    panels.forEach(panel => (panel.hidden = panel.id !== target));
    if (empty) empty.hidden = cell !== undefined;
  };

  cells.forEach(cell => {
    cell.disabled = false;
    cell.addEventListener('click', () => show(cell.getAttribute('aria-expanded') === 'true' ? undefined : cell));
  });
}

initSteps();
initTimesheet();
