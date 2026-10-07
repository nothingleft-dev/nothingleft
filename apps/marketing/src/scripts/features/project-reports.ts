function initChart(root: HTMLElement): void {
  const marks = [...root.querySelectorAll<HTMLButtonElement>('[data-mark]')];
  const plot = root.querySelector<HTMLElement>('[data-plot]');
  const tip = root.querySelector<HTMLElement>('[data-tip]');
  const live = root.querySelector<HTMLElement>('[data-live]');
  if (marks.length === 0 || !plot || !tip) return;

  const tipValue = tip.querySelector<HTMLElement>('[data-tip-value]');
  const tipLabel = tip.querySelector<HTMLElement>('[data-tip-label]');
  const tipHint = tip.querySelector<HTMLElement>('[data-tip-hint]');

  const showTip = (mark: HTMLButtonElement) => {
    if (tipValue) tipValue.textContent = mark.dataset.tipValue ?? '';
    if (tipLabel) tipLabel.textContent = mark.dataset.tipLabel ?? '';
    if (tipHint) tipHint.textContent = mark.dataset.tipHint ?? '';
    tip.hidden = false;
    const anchor = mark.querySelector<HTMLElement>('[data-anchor]') ?? mark;
    const box = plot.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = mark.dataset.tipAt === 'end' ? at.right - box.left : at.left - box.left + at.width / 2;
    tip.style.left = `${Math.min(Math.max(x, half), box.width - half)}px`;
    tip.style.top = `${at.top - box.top}px`;
  };
  const hideTip = () => {
    tip.hidden = true;
  };

  const select = (mark: HTMLButtonElement) => {
    const key = mark.dataset.mark;
    marks.forEach(other => {
      const on = other === mark;
      other.setAttribute('aria-pressed', String(on));
      other.tabIndex = on ? 0 : -1;
    });
    root.querySelectorAll<HTMLElement>('[data-for]').forEach(el => el.classList.toggle('on', el.dataset.for === key));
    root.querySelectorAll<HTMLElement>('[data-panel]').forEach(el => (el.hidden = el.dataset.panel !== key));
    root.querySelectorAll<HTMLElement>('[data-text]').forEach(el => {
      const text = mark.dataset[`text${el.dataset.text ?? ''}`];
      if (text !== undefined) el.textContent = text;
    });
    root.querySelectorAll<HTMLAnchorElement>('[data-open]').forEach(link => {
      link.href = `#${mark.getAttribute('aria-controls') ?? ''}`;
    });
    if (live) live.textContent = mark.dataset.announce ?? '';
  };

  marks.forEach((mark, index) => {
    mark.tabIndex = mark.getAttribute('aria-pressed') === 'true' ? 0 : -1;
    mark.addEventListener('click', () => select(mark));
    mark.addEventListener('pointerenter', () => showTip(mark));
    mark.addEventListener('pointerleave', () => {
      if (document.activeElement !== mark) hideTip();
    });
    mark.addEventListener('focus', () => showTip(mark));
    mark.addEventListener('blur', hideTip);
    mark.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        hideTip();
        return;
      }
      let next: number | undefined;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(index + 1, marks.length - 1);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(index - 1, 0);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = marks.length - 1;
      const target = next === undefined ? undefined : marks[next];
      if (!target) return;
      event.preventDefault();
      marks.forEach(other => (other.tabIndex = other === target ? 0 : -1));
      target.focus();
    });
  });

  root.querySelectorAll<HTMLAnchorElement>('[data-open]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    });
  });
}

document.querySelectorAll<HTMLElement>('[data-report-chart]').forEach(initChart);
