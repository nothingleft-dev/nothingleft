const ANNOUNCE: Record<string, string> = {
  issue: 'Showing ACME-12. Invitation links and expiry is listed under Referenced by.',
  article: 'Showing Invitation links and expiry. ACME-12 is linked in its text.',
};

function initFollowTheKey(): void {
  const root = document.querySelector<HTMLElement>('[data-kb-follow-root]');
  if (!root) return;
  const status = root.querySelector<HTMLElement>('[data-kb-status]');
  const ref = root.querySelector<HTMLElement>('[data-kb-ref]');

  root.querySelectorAll<HTMLAnchorElement>('[data-kb-follow]').forEach(link => {
    link.addEventListener('click', event => {
      const target = link.dataset.kbFollow ?? '';
      const tab = root.querySelector<HTMLButtonElement>(`[data-kb-tab="${target}"]`);
      const landing = root.querySelector<HTMLElement>(`[data-kb-landing="${target}"]`);
      if (!tab || !landing) return;
      event.preventDefault();
      tab.click();
      landing.focus();
      if (status) status.textContent = ANNOUNCE[target] ?? '';
      if (target === 'issue' && ref) {
        ref.classList.remove('kb-arrive');
        // Reading layout restarts the highlight when the key is followed twice in a row.
        void ref.offsetWidth;
        ref.classList.add('kb-arrive');
      }
    });
  });
}

function initRunbookSteps(): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-kb-step]')];
  const views = [...document.querySelectorAll<HTMLElement>('#kb-flow-panel [data-view]')];
  if (buttons.length === 0) return;

  const select = (step: string) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kbStep === step)));
    views.forEach(view => view.classList.toggle('on', view.dataset.view === step));
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.kbStep ?? '1'));
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
      select(target.dataset.kbStep ?? '1');
    });
  });
}

initFollowTheKey();
initRunbookSteps();
