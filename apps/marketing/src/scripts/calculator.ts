import { TEAM_SIZE } from '@lib/pricing';
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

// "1,250.50" and "12,50" are both read as people type them: a comma followed by one or two
// final digits is a decimal mark, any other comma groups thousands.
export function parseAmount(raw: string): number | null {
  let text = raw.replace(/[\s'’]/g, '').replace(/[^\d.,]/g, '');
  if (text === '') return null;
  if (/,\d{1,2}$/.test(text) && !text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function initCalculator(): void {
  const root = document.getElementById('calculator');
  if (!root) return;

  const slider = el(root, '[role="slider"]');
  const fill = el(root, '[data-slider-fill]');
  const thumb = el(root, '[data-slider-thumb]');
  const sizeInput = el<HTMLInputElement>(root, '#calc-size');
  const amountInput = el<HTMLInputElement>(root, '#calc-amount');
  const amountLabel = el(root, '[data-amount-label]');
  const amountPrefix = el(root, '[data-amount-prefix]');
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

    const amount = parseAmount(amountInput.value);
    if (amount === null) {
      current.textContent = '—';
      currentBasis.textContent = '';
      avoided.textContent = '—';
      message.textContent = 'Enter what you pay today to see the comparison.';
      return;
    }
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
    render();
  });
  initSegmented(el(root, '[data-group="currency"]'), value => {
    currency = value;
    render();
  });
  initSegmented(el(root, '[data-group="tool"]'), value => {
    const option = root.querySelector<HTMLElement>(`[data-group="tool"] [data-value="${value}"]`);
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
