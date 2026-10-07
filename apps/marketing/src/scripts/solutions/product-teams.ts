import { CANDIDATES, groupCandidates, plural, SPRINT, type GroupBy } from '@lib/solutions/product-teams';
import { initSegmented } from '@scripts/segmented';

const GROUP_NAMES: Record<GroupBy, string> = { impact: 'Impact', priority: 'priority' };

const FOLLOW_ANNOUNCE: Record<string, string> = {
  issue: 'Showing ACME-12. Invitation links and expiry is listed under Referenced by.',
  article: 'Showing Invitation links and expiry. ACME-12 is linked in its text.',
};

function initPlan(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>('[data-pt-status]');
  const summary = root.querySelector<HTMLElement>('[data-pt-summary]');
  const group = root.querySelector<HTMLElement>('[data-pt-group]');
  const ref = root.querySelector<HTMLElement>('[data-pt-ref]');
  const announce = (text: string) => {
    if (status) status.textContent = text;
  };

  const picked = new Set<string>();

  const summaryText = () => {
    const issues = CANDIDATES.filter(issue => picked.has(issue.key));
    if (issues.length === 0) return 'From this view: nothing yet. Plan an issue above.';
    const points = issues.reduce((sum, issue) => sum + issue.points, 0);
    return `From this view: ${plural(issues.length, 'issue')}, ${plural(points, 'point')}`;
  };

  const render = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-pt-move]').forEach(button => {
      button.setAttribute('aria-pressed', String(picked.has(button.dataset.ptMove ?? '')));
    });
    root.querySelectorAll<HTMLElement>('[data-pt-row]').forEach(row => {
      row.classList.toggle('pt-on', picked.has(row.dataset.ptRow ?? ''));
    });
    root.querySelectorAll<HTMLElement>('[data-pt-in]').forEach(chip => {
      chip.hidden = !picked.has(chip.dataset.ptIn ?? '');
    });
    root.querySelectorAll<HTMLElement>('[data-pt-sprint]').forEach(field => {
      const planned = picked.has(field.dataset.ptSprint ?? '');
      field.textContent = planned ? SPRINT.name : 'Backlog';
      field.classList.toggle('empty', !planned);
    });
    if (summary) summary.textContent = summaryText();
  };

  root.querySelectorAll<HTMLButtonElement>('[data-pt-move]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.ptMove ?? '';
      const planning = !picked.has(key);
      if (planning) picked.add(key);
      else picked.delete(key);
      render();
      const where = planning ? `planned into ${SPRINT.name}` : 'moved back to the backlog';
      announce(`${key} ${where}. ${summaryText().replace(/\.$/, '')}.`);
    });
  });

  if (group) {
    initSegmented(group, value => {
      const by = value === 'priority' ? 'priority' : 'impact';
      root.querySelectorAll<HTMLElement>('[data-pt-grouping]').forEach(list => {
        list.hidden = list.dataset.ptGrouping !== by;
      });
      const counts = groupCandidates(by)
        .map(entry => `${entry.label} ${entry.issues.length}`)
        .join(', ');
      announce(`Grouped by ${GROUP_NAMES[by]}: ${counts}.`);
    });
  }

  root.querySelectorAll<HTMLAnchorElement>('[data-pt-follow]').forEach(link => {
    link.addEventListener('click', event => {
      const target = link.dataset.ptFollow ?? '';
      const tab = root.querySelector<HTMLButtonElement>(`[data-pt-tab="${target}"]`);
      const landing = root.querySelector<HTMLElement>(`[data-pt-landing="${target}"]`);
      if (!tab || !landing) return;
      event.preventDefault();
      tab.click();
      landing.focus();
      announce(FOLLOW_ANNOUNCE[target] ?? '');
      if (target === 'issue' && ref) {
        ref.classList.remove('pt-arrive');
        // Reading layout restarts the highlight when the key is followed twice in a row.
        void ref.offsetWidth;
        ref.classList.add('pt-arrive');
      }
    });
  });

  render();
}

const root = document.querySelector<HTMLElement>('[data-pt-plan]');
if (root) initPlan(root);
