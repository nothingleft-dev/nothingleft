// Radio-group semantics on buttons: arrow keys move and select, Tab leaves the group.
export function initSegmented(group: HTMLElement, onChange: (value: string) => void): void {
  const options = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];

  const select = (option: HTMLButtonElement, focus: boolean) => {
    options.forEach(other => {
      const checked = other === option;
      other.setAttribute('aria-checked', String(checked));
      other.tabIndex = checked ? 0 : -1;
    });
    if (focus) option.focus();
    onChange(option.dataset.value ?? '');
  };

  options.forEach((option, index) => {
    option.addEventListener('click', () => select(option, false));
    option.addEventListener('keydown', event => {
      let next: number | undefined;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = options.length - 1;
      const target = next === undefined ? undefined : options[next];
      if (!target) return;
      event.preventDefault();
      select(target, true);
    });
  });
}
