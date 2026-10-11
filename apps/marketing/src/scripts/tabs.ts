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

let announcer: HTMLElement | undefined;
function announce(text: string): void {
  if (!announcer) {
    announcer = document.createElement('p');
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    document.body.append(announcer);
  }
  announcer.textContent = text;
}

function selectContents(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
    const source = document.getElementById(button.dataset.copy ?? '');
    if (!source) {
      button.hidden = true;
      return;
    }
    const label = button.textContent ?? 'Copy';
    let reset: number | undefined;
    button.addEventListener('click', async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(source.textContent ?? '');
        copied = true;
      } catch {
        selectContents(source);
      }
      button.textContent = copied ? 'Copied' : 'Text selected';
      announce(
        copied
          ? 'Copied to the clipboard.'
          : 'Could not copy automatically. The text is selected: copy it with your keyboard or the context menu.',
      );
      window.clearTimeout(reset);
      reset = window.setTimeout(() => (button.textContent = label), copied ? 1600 : 6000);
    });
  });
}
