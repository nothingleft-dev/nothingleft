import { TEAM_SIZE, formatListPrice } from '@lib/pricing';
import { initSegmented } from './segmented';

type Mode = 'seat' | 'total';

function el<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`${selector} is missing from the calculator markup`);
  return found;
}

function clampSize(value: number): number {
  return Math.min(TEAM_SIZE.max, Math.max(TEAM_SIZE.min, Math.round(value)));
}

// The track is logarithmic so 20 to 100 members gets as much room as 200 to 1,000.
const LOG_SPAN = Math.log(TEAM_SIZE.max / TEAM_SIZE.min);
const sizeToRatio = (size: number) => Math.log(size / TEAM_SIZE.min) / LOG_SPAN;
const ratioToSize = (ratio: number) => clampSize(TEAM_SIZE.min * Math.exp(ratio * LOG_SPAN));

const MAX_AMOUNT = 100_000_000;

export type ParsedAmount = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'amount'; value: number };

const GROUPED: Record<string, RegExp> = {
  ',': /^(\d{1,3}(,\d{3})*|\d{1,2}(,\d{2})*,\d{3})$/,
  '.': /^\d{1,3}(\.\d{3})*$/,
};

// "1,250.50", "1.250,50" and "12,50" are read as people write them: the last separator is the decimal
// mark when both appear, and a lone comma before one or two final digits is one too. Anything that
// is not a well-grouped figure is rejected rather than reinterpreted.
export function parseAmount(raw: string): ParsedAmount {
  const text = raw.replace(/[\s'’]/g, '');
  if (text === '') return { kind: 'empty' };
  if (!/^\d[\d.,]*$/.test(text)) return { kind: 'invalid' };

  const dot = text.lastIndexOf('.');
  const comma = text.lastIndexOf(',');
  let decimal: '.' | ',' | undefined;
  if (dot >= 0 && comma >= 0) decimal = dot > comma ? '.' : ',';
  else if (comma >= 0) decimal = /^\d+,\d{1,2}$/.test(text) ? ',' : undefined;
  else if (dot >= 0) decimal = text.indexOf('.') === dot ? '.' : undefined;

  const [whole = '', fraction = '', ...extra] = decimal ? text.split(decimal) : [text];
  if (extra.length > 0 || (decimal && !/^\d+$/.test(fraction))) return { kind: 'invalid' };
  const group = decimal === '.' ? ',' : decimal === ',' ? '.' : comma >= 0 ? ',' : '.';
  if (/[.,]/.test(whole) && !GROUPED[group]?.test(whole)) return { kind: 'invalid' };

  const value = Number(`${whole.replace(/[.,]/g, '')}.${fraction || '0'}`);
  return Number.isFinite(value) && value <= MAX_AMOUNT ? { kind: 'amount', value } : { kind: 'invalid' };
}

export function initCalculator(): void {
  const root = document.getElementById('calculator');
  if (!root) return;
  try {
    wireCalculator(root);
  } catch (error) {
    root.closest('section')?.classList.add('calc-failed');
    throw error;
  }
}

function wireCalculator(root: HTMLElement): void {
  const slider = el(root, '[role="slider"]');
  const fill = el(root, '[data-slider-fill]');
  const thumb = el(root, '[data-slider-thumb]');
  const sizeInput = el<HTMLInputElement>(root, '#calc-size');
  const amountInput = el<HTMLInputElement>(root, '#calc-amount');
  const amountLabel = el(root, '[data-amount-label]');
  const amountPrefix = el(root, '[data-amount-prefix]');
  const amountHint = el(root, '[data-amount-hint]');
  const listNote = el(root, '[data-list-note]');
  const listTool = el(root, '[data-list-tool]');
  const toolLink = el<HTMLAnchorElement>(root, '[data-tool-link]');
  const toolLinkName = el(root, '[data-tool-name]');
  const toolNote = el(root, '[data-tool-note]');
  const current = el(root, '[data-out-current]');
  const currentBasis = el(root, '[data-out-basis]');
  const ours = el(root, '[data-out-ours]');
  const avoided = el(root, '[data-out-avoided]');
  const message = el(root, '[data-out-message]');

  let size: number = TEAM_SIZE.initial;
  let mode: Mode = 'seat';
  let currency = 'USD';
  let tool = root.querySelector<HTMLElement>('[data-group="tool"] [aria-checked="true"]');
  let filledAmount: string | null = amountInput.value || null;

  // A figure the visitor typed is theirs: only an empty field or our own last fill is replaced.
  const fillListPrice = () => {
    if (amountInput.value !== '' && amountInput.value !== filledAmount) return;
    const price = Number(tool?.dataset.listPrice);
    filledAmount = currency === 'USD' && mode === 'seat' && price > 0 ? formatListPrice(price) : null;
    amountInput.value = filledAmount ?? '';
  };

  const money = (value: number) =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  const symbol = () =>
    new Intl.NumberFormat('en', { style: 'currency', currency }).formatToParts(0).find(part => part.type === 'currency')
      ?.value ?? currency;

  const render = () => {
    const ratio = sizeToRatio(size);
    fill.style.width = `${ratio * 100}%`;
    thumb.style.left = `${ratio * 100}%`;
    slider.setAttribute('aria-valuenow', String(size));
    slider.setAttribute('aria-valuetext', `${size} members`);
    if (document.activeElement !== sizeInput) sizeInput.value = String(size);

    amountLabel.textContent = mode === 'seat' ? 'Price per seat, per month' : 'Total monthly bill';
    amountPrefix.textContent = symbol();
    ours.textContent = money(0);

    const filled = filledAmount !== null && amountInput.value === filledAmount;
    listNote.hidden = !filled;
    if (filled) listTool.textContent = tool?.dataset.name ?? '';

    const parsed = parseAmount(amountInput.value);
    const invalid = parsed.kind === 'invalid';
    amountInput.setAttribute('aria-invalid', String(invalid));
    amountHint.classList.toggle('calc-hint-error', invalid);
    amountHint.textContent = invalid
      ? 'That is not an amount we can read. Use digits only, such as 1250, 1,250.50 or 1.250,50.'
      : 'Digits only, such as 1250, 1,250.50 or 1.250,50.';
    if (parsed.kind !== 'amount') {
      current.textContent = '—';
      currentBasis.textContent = '';
      avoided.textContent = '—';
      message.textContent = invalid
        ? 'Fix the amount to see the comparison.'
        : 'Enter what you pay today to see the comparison.';
      return;
    }
    const amount = parsed.value;
    const spend = mode === 'seat' ? amount * size : amount;
    current.textContent = `${money(spend)} / month`;
    currentBasis.textContent = mode === 'seat' ? `${money(amount)} × ${size} members` : `${size} members`;
    avoided.textContent = `${money(spend)} / month`;
    message.textContent =
      spend === 0
        ? 'You pay nothing today, so there is no subscription to avoid. The comparison that matters is the work: try it on one project.'
        : '';
  };

  const setSize = (next: number) => {
    size = clampSize(next);
    render();
  };

  slider.addEventListener('keydown', event => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 10,
      PageDown: -10,
    };
    if (event.key === 'Home') setSize(TEAM_SIZE.min);
    else if (event.key === 'End') setSize(TEAM_SIZE.max);
    else if (event.key in steps) setSize(size + (steps[event.key] ?? 0));
    else return;
    event.preventDefault();
  });

  const fromPointer = (event: PointerEvent) => {
    const rect = slider.getBoundingClientRect();
    setSize(ratioToSize(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))));
  };
  slider.addEventListener('pointerdown', event => {
    slider.setPointerCapture(event.pointerId);
    slider.focus();
    fromPointer(event);
  });
  slider.addEventListener('pointermove', event => {
    if (slider.hasPointerCapture(event.pointerId)) fromPointer(event);
  });

  sizeInput.addEventListener('input', () => {
    const typed = Number(sizeInput.value.replace(/\D/g, ''));
    if (typed >= TEAM_SIZE.min && typed <= TEAM_SIZE.max) setSize(typed);
  });
  sizeInput.addEventListener('change', () => {
    setSize(Number(sizeInput.value.replace(/\D/g, '')) || TEAM_SIZE.min);
    sizeInput.value = String(size);
  });
  amountInput.addEventListener('input', render);

  initSegmented(el(root, '[data-group="mode"]'), value => {
    mode = value === 'total' ? 'total' : 'seat';
    fillListPrice();
    render();
  });
  initSegmented(el(root, '[data-group="currency"]'), value => {
    currency = value;
    fillListPrice();
    render();
  });
  initSegmented(el(root, '[data-group="tool"]'), value => {
    const option = root.querySelector<HTMLElement>(`[data-group="tool"] [data-value="${value}"]`);
    tool = option;
    fillListPrice();
    render();
    const url = option?.dataset.pricingUrl;
    toolLink.hidden = !url;
    toolNote.hidden = Boolean(url);
    if (url) {
      toolLink.href = url;
      toolLinkName.textContent = option?.dataset.name ?? '';
    }
  });

  render();
}
