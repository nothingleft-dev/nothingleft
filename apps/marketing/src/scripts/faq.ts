const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const DURATION_MS = 260;

export function initFaq(): void {
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'ease-out';

  document.querySelectorAll<HTMLElement>('.faq').forEach(group => {
    const items = [...group.querySelectorAll<HTMLDetailsElement>('details')];
    const wanted = new Map(items.map(details => [details, details.open]));
    const running = new Map<HTMLDetailsElement, Animation>();

    const toggle = (details: HTMLDetailsElement, open: boolean) => {
      wanted.set(details, open);
      details.toggleAttribute('data-closing', !open);
      const answer = details.querySelector<HTMLElement>('.a');
      const startHeight = details.open && answer ? answer.getBoundingClientRect().height : 0;
      running.get(details)?.cancel();
      if (!answer || reduceMotion.matches) {
        details.open = open;
        details.removeAttribute('data-closing');
        return;
      }
      details.open = true;
      const padding = getComputedStyle(answer).paddingBottom;
      const endHeight = open ? answer.scrollHeight : 0;
      answer.style.overflow = 'hidden';
      const animation = answer.animate(
        [
          { height: `${startHeight}px`, paddingBottom: startHeight ? padding : '0px', opacity: startHeight ? 1 : 0 },
          { height: `${endHeight}px`, paddingBottom: open ? padding : '0px', opacity: open ? 1 : 0 },
        ],
        { duration: DURATION_MS, easing },
      );
      running.set(details, animation);
      animation.onfinish = () => {
        running.delete(details);
        answer.style.overflow = '';
        details.open = open;
        details.removeAttribute('data-closing');
      };
      animation.oncancel = () => {
        if (running.get(details) === animation) answer.style.overflow = '';
      };
    };

    items.forEach(details => {
      // The script keeps the group exclusive itself, so a closing answer can animate instead of vanishing.
      details.removeAttribute('name');
      details.querySelector('summary')?.addEventListener('click', event => {
        event.preventDefault();
        const open = !wanted.get(details);
        if (open) items.forEach(other => other !== details && wanted.get(other) && toggle(other, false));
        toggle(details, open);
      });
    });
  });
}
