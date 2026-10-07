import { track } from '@lib/analytics';

const START_QUERY = 'type: Bug #Unresolved';
const AGENT_QUERY = 'type: Bug #Unresolved assignee: Unassigned priority: Major, Critical';

interface Beat {
  at: number;
  step: number;
  completes?: number;
  run: () => void;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the demo markup`);
  return el as T;
}

function pick<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} is missing from the demo markup`);
  return el;
}

// The HTML holds the finished state; rewind() puts it back to the start.
export function initDemo(): void {
  if (!document.getElementById('demo')) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const demo = byId('demo');
  const query = byId('demo-query');
  const count = byId('demo-count');
  const caret = byId('demo-caret');
  const rows = [...document.querySelectorAll<HTMLElement>('#demo-rows .row')];
  const target = pick(document, '#demo-rows .row[data-target]');
  const who = pick(target, '[data-who]');
  const whoName = pick(target, '[data-who-name]');
  const whoAvatar = pick(who, '.av');
  const whoCell = who.parentElement ?? who;
  const spent = pick(target, '[data-spent]');
  const statusField = pick(target, '[data-status-field]');
  const dot = pick(target, '[data-dot]');
  const status = pick(target, '[data-status]');
  const plan = [...document.querySelectorAll<HTMLElement>('.plan li')];
  const states = [...document.querySelectorAll<HTMLElement>('#demo .state')];
  const stepButtons = [...document.querySelectorAll<HTMLButtonElement>('#demo-steps .step')];

  const show = (beat: string) => states.filter(el => el.dataset.beat === beat).forEach(el => el.classList.add('on'));
  const markDone = (index: number) => plan[index]?.classList.add('done');
  const flash = (el: HTMLElement) => {
    if (reduceMotion.matches) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };
  const pressStep = (n: number) =>
    stepButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === n)));

  // Each beat belongs to the step it is part of; a beat that finishes a step says so.
  const beats: Beat[] = [
    { at: 400, step: 0, run: () => show('0') },
    { at: 1100, step: 1, run: () => show('1') },
    {
      at: 1700,
      step: 1,
      completes: 1,
      run: () => {
        show('1b');
        markDone(0);
        query.textContent = AGENT_QUERY;
        caret.hidden = true;
        count.textContent = '3 issues';
        rows.forEach(row => {
          if (row.hasAttribute('data-match')) return;
          row.classList.add('dim');
          // Filtered out of the result: decorative from here on, so it leaves the accessibility tree.
          row.setAttribute('aria-hidden', 'true');
        });
      },
    },
    { at: 2500, step: 2, run: () => show('2') },
    {
      at: 3100,
      step: 2,
      completes: 2,
      run: () => {
        show('2b');
        markDone(1);
        target.classList.add('sel');
        whoCell.classList.remove('none');
        whoAvatar.hidden = false;
        whoName.textContent = 'Alex Lee';
        dot.classList.add('started');
        status.textContent = 'In Progress';
        flash(who);
        flash(statusField);
      },
    },
    { at: 3800, step: 3, run: () => show('3') },
    {
      at: 4400,
      step: 3,
      completes: 3,
      run: () => {
        show('3b');
        markDone(2);
        spent.textContent = '20m';
        flash(spent);
      },
    },
    { at: 5000, step: 3, run: () => show('4') },
  ];

  let timers: number[] = [];

  const rewind = () => {
    timers.forEach(clearTimeout);
    timers = [];
    states.forEach(el => el.classList.remove('on'));
    plan.forEach(li => li.classList.remove('done'));
    rows.forEach(row => {
      row.classList.remove('dim', 'sel');
      row.removeAttribute('aria-hidden');
    });
    query.textContent = START_QUERY;
    caret.hidden = false;
    count.textContent = '5 issues';
    whoCell.classList.add('none');
    whoAvatar.hidden = true;
    whoName.textContent = 'Unassigned';
    spent.textContent = '—';
    dot.classList.remove('started');
    status.textContent = 'Open';
    [who, statusField, spent].forEach(el => el.classList.remove('flash'));
    pressStep(0);
  };

  const fire = (beat: Beat) => {
    beat.run();
    if (beat.completes) pressStep(beat.completes);
  };

  const play = (trigger: 'visible' | 'replay' | 'watch_link') => {
    rewind();
    track({ name: 'demo_played', trigger });
    if (reduceMotion.matches) {
      beats.forEach(fire);
      return;
    }
    timers = beats.map(beat => window.setTimeout(() => fire(beat), beat.at));
  };

  // Jump to the end of a step: every beat that belongs to it or an earlier one, with no delays.
  const scrubTo = (n: number) => {
    rewind();
    beats.filter(beat => beat.step <= n).forEach(beat => beat.run());
    pressStep(n);
    track({ name: 'demo_step_selected', step: n });
  };

  stepButtons.forEach(button => button.addEventListener('click', () => scrubTo(Number(button.dataset.step))));
  byId('demo-replay').addEventListener('click', () => play('replay'));
  byId('watch').addEventListener('click', event => {
    event.preventDefault();
    byId('demo-figure').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    play('watch_link');
  });

  const callsToggle = byId('calls-toggle');
  const calls = byId('demo-calls');
  callsToggle.addEventListener('click', () => {
    const open = callsToggle.getAttribute('aria-expanded') !== 'true';
    callsToggle.setAttribute('aria-expanded', String(open));
    calls.hidden = !open;
  });

  rewind();
  demo.classList.add('ready');

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          play('visible');
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(demo);
  } else {
    play('visible');
  }
}
