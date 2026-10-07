export function initTabs(): void {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach(root => {
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const select = (tab: HTMLButtonElement, focus: boolean) => {
      tabs.forEach(other => {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
        panel?.classList.toggle('on', selected);
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', event => {
        let next: number | undefined;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        const target = next === undefined ? undefined : tabs[next];
        if (!target) return;
        event.preventDefault();
        select(target, true);
      });
    });
  });
}

export function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
    const source = document.getElementById(button.dataset.copy ?? '');
    if (!source || !navigator.clipboard) {
      button.hidden = true;
      return;
    }
    const label = button.textContent ?? 'Copy';
    let reset: number | undefined;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(source.textContent ?? '');
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Press Ctrl+C';
      }
      window.clearTimeout(reset);
      reset = window.setTimeout(() => (button.textContent = label), 1600);
    });
  });
}
