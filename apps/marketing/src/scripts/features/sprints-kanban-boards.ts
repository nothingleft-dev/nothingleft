import {
  columnName,
  COLUMNS,
  DEMO_MOVES,
  DESTINATIONS,
  destinationAfter,
  formatTally,
  INITIAL_STATE,
  isCardShown,
  isOverLimit,
  plural,
  SPRINT,
  SPRINT_ISSUES,
  tallyBoard,
  TOTAL_POINTS,
  type ColumnId,
  type DemoState,
  type DestinationId,
  type MoveId,
} from '@lib/features/sprints-kanban-boards';
import { initSegmented } from '@scripts/segmented';

const fresh = (): DemoState => ({ ...INITIAL_STATE, moved: { ...INITIAL_STATE.moved } });
const tallyText = (count: number, points: number) => `${count} · ${plural(points, 'pt')}`;

function initSprintDemo(): void {
  const root = document.querySelector<HTMLElement>('[data-sk-demo]');
  if (!root) return;

  const all = <T extends HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const one = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);

  const status = one('[data-status]');
  const finishButton = one<HTMLButtonElement>('[data-finish]');
  const resetButton = one<HTMLButtonElement>('[data-reset]');
  const hint = one('[data-hint]');
  const radioGroup = one('[data-destinations]');
  const radios = all<HTMLButtonElement>('[data-destinations] [role="radio"]');

  let state = fresh();

  const destinationName = (id: DestinationId | null) => DESTINATIONS.find(item => item.id === id)?.name ?? '';

  const render = () => {
    const tally = tallyBoard(state);

    all('[data-card]').forEach(card => {
      const issue = SPRINT_ISSUES.find(candidate => candidate.key === card.dataset.card);
      card.hidden = !issue || !isCardShown(issue, card.dataset.col as ColumnId, state);
    });

    COLUMNS.forEach(column => {
      const columnTally = tally.columns[column.id];
      const count = one(`[data-count="${column.id}"]`);
      const points = one(`[data-points="${column.id}"]`);
      const empty = one(`[data-empty="${column.id}"]`);
      const now = one(`[data-now="${column.id}"]`);
      if (count) count.textContent = String(columnTally.count);
      if (points) points.textContent = plural(columnTally.points, 'point');
      if (now) now.textContent = tallyText(columnTally.count, columnTally.points);
      if (empty) {
        empty.hidden = columnTally.count > 0;
        empty.textContent = state.finished ? `Moved to ${destinationName(state.destination)}` : 'No cards';
      }
      one(`[data-wip="${column.id}"]`)?.classList.toggle('over', isOverLimit(column, columnTally));
    });

    const unfinishedNow = one('[data-now="unfinished"]');
    if (unfinishedNow) {
      unfinishedNow.textContent = state.finished
        ? 'Moved out'
        : tallyText(tally.unfinished.count, tally.unfinished.points);
    }
    const resolved = one('[data-resolved]');
    if (resolved) resolved.textContent = String(tally.resolvedPoints);
    const sprintState = one('[data-sprint-state]');
    if (sprintState) sprintState.textContent = state.finished ? 'Completed' : 'Active';
    const unfinished = one('[data-unfinished]');
    if (unfinished) {
      unfinished.textContent = state.finished
        ? `Finished. ${formatTally(tally.columns.fixed)} stay with ${SPRINT.name}.`
        : `${formatTally(tally.unfinished)} unfinished. Where do they go?`;
    }

    all<HTMLButtonElement>('[data-move]').forEach(button => {
      const move = DEMO_MOVES.find(candidate => candidate.id === button.dataset.move);
      const issue = SPRINT_ISSUES.find(candidate => candidate.key === move?.key);
      if (!move || !issue) return;
      button.textContent = state.moved[move.id]
        ? `Move ${move.key} back to ${columnName(issue.column)}`
        : `Move ${move.key} to ${columnName(move.to)}`;
      button.setAttribute('aria-disabled', String(state.finished));
    });

    radios.forEach((radio, index) => {
      const checked = radio.dataset.value === state.destination;
      radio.setAttribute('aria-checked', String(checked));
      radio.tabIndex = checked || (state.destination === null && index === 0) ? 0 : -1;
      radio.setAttribute('aria-disabled', String(state.finished));
    });
    finishButton?.setAttribute('aria-disabled', String(state.destination === null || state.finished));
    if (hint) {
      hint.textContent = state.finished
        ? 'Finished. Start over to try the other destination.'
        : state.destination === null
          ? 'Pick a destination first.'
          : `${formatTally(tally.unfinished)} will move to ${destinationName(state.destination)}.`;
    }

    DESTINATIONS.forEach(destination => {
      const cell = one(`[data-destination="${destination.id}"]`);
      if (!cell) return;
      const after = destinationAfter(destination, state);
      cell.textContent =
        after.count === destination.issues
          ? formatTally(after)
          : `${destination.issues} → ${after.count} issues, ${destination.points} → ${after.points} points`;
    });
    const kept = one('[data-kept]');
    if (kept) {
      kept.textContent = state.finished
        ? `Completed. Keeps ${formatTally(tally.columns.fixed)} it resolved.`
        : 'Running. Resolved issues stay with it when it finishes.';
    }
    const history = one('[data-history]');
    if (history) history.hidden = !state.finished;
    const historyLine = one('[data-history-line]');
    if (historyLine) historyLine.textContent = `Sprint: ${SPRINT.name} → ${destinationName(state.destination)}`;
  };

  const announce = (text: string) => {
    if (status) status.textContent = text;
  };

  const flash = (key: string) => {
    const card = all('[data-card]').find(candidate => candidate.dataset.card === key && !candidate.hidden);
    if (!card) return;
    card.classList.remove('moved');
    void card.offsetWidth;
    card.classList.add('moved');
  };

  all<HTMLButtonElement>('[data-move]').forEach(button => {
    button.addEventListener('click', () => {
      if (state.finished) {
        announce(`${SPRINT.name} is finished. Start over to move cards again.`);
        return;
      }
      const id = button.dataset.move as MoveId;
      const move = DEMO_MOVES.find(candidate => candidate.id === id);
      const issue = SPRINT_ISSUES.find(candidate => candidate.key === move?.key);
      if (!move || !issue) return;
      state = { ...state, moved: { ...state.moved, [id]: !state.moved[id] } };
      render();
      flash(move.key);

      const target = state.moved[id] ? move.to : issue.column;
      const column = COLUMNS.find(candidate => candidate.id === target);
      const tally = tallyBoard(state);
      let text = `${move.key} moved to ${columnName(target)}, which now holds ${plural(tally.columns[target].count, 'card')}.`;
      if (column && isOverLimit(column, tally.columns[target])) {
        text += ` That is over its maximum of ${column.wipMax}: the limit turns red, and the move still goes through.`;
      }
      text += ` ${tally.resolvedPoints} of ${TOTAL_POINTS} points resolved.`;
      announce(text);
    });
  });

  if (radioGroup) {
    initSegmented(radioGroup, value => {
      if (state.finished) {
        render();
        return;
      }
      state = { ...state, destination: value as DestinationId };
      render();
      announce(`${destinationName(state.destination)} chosen. Finish the sprint to move its unfinished issues there.`);
    });
  }

  finishButton?.addEventListener('click', () => {
    if (state.finished) return;
    if (state.destination === null) {
      announce('Choose where the unfinished issues go first. Nothing is chosen for you.');
      return;
    }
    const tally = tallyBoard(state);
    state = { ...state, finished: true };
    render();
    announce(
      `${SPRINT.name} finished. ${formatTally(tally.unfinished)} moved to ${destinationName(state.destination)}; ${formatTally(tally.columns.fixed)} stay with ${SPRINT.name}.`,
    );
  });

  resetButton?.addEventListener('click', () => {
    state = fresh();
    render();
    announce(`Board back to ${SPRINT.today}. Move a card to begin.`);
  });

  render();
  announce('Move a card to begin.');
  root.classList.add('ready');
}

initSprintDemo();
