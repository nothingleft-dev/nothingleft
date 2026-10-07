import { GROUP_LABEL, type MatrixGroup } from '@lib/compare';

// Without JS every row stays visible and the filter stays hidden.
export function initComparisonMatrix(): void {
  document.querySelectorAll<HTMLElement>('[data-matrix-filter]').forEach(tools => {
    const table = document.querySelector<HTMLTableElement>(`[data-matrix="${tools.dataset.matrixFilter}"]`);
    if (!table) return;
    const buttons = [...tools.querySelectorAll<HTMLButtonElement>('[data-matrix-group]')];
    const status = tools.querySelector<HTMLElement>('[data-matrix-status]');
    const bodies = [...table.tBodies];
    tools.hidden = false;

    buttons.forEach(button =>
      button.addEventListener('click', () => {
        const group = button.dataset.matrixGroup ?? 'all';
        buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        bodies.forEach(body => (body.hidden = group !== 'all' && body.dataset.group !== group));
        const rows = bodies.filter(body => !body.hidden).reduce((sum, body) => sum + body.rows.length - 1, 0);
        if (status) {
          const label = group === 'all' ? 'all capabilities' : GROUP_LABEL[group as MatrixGroup];
          status.textContent = `Showing ${label}: ${rows} ${rows === 1 ? 'row' : 'rows'}.`;
        }
      }),
    );
  });
}
