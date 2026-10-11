// On the parent domain, so dismissing the notice on either site hides it on both.
const DISMISSED_COOKIE = 'nl_notice_dismissed';
const ONE_YEAR_S = 365 * 24 * 60 * 60;
const LIFETIME_MS = 10_000;

function wasDismissed(): boolean {
  try {
    return document.cookie.split('; ').includes(`${DISMISSED_COOKIE}=1`);
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  const { hostname, protocol } = location;
  const shared = hostname === 'nothingleft.dev' || hostname.endsWith('.nothingleft.dev');
  try {
    document.cookie = [
      `${DISMISSED_COOKIE}=1`,
      'Path=/',
      `Max-Age=${ONE_YEAR_S}`,
      'SameSite=Lax',
      ...(shared ? ['Domain=.nothingleft.dev'] : []),
      ...(protocol === 'https:' ? ['Secure'] : []),
    ].join('; ');
  } catch {
    // Without cookies the notice simply returns on the next visit.
  }
}

/** Notice only: analytics loads either way, so dismissing is the one choice it offers. */
export function initCookieNotice(): void {
  const notice = document.querySelector<HTMLElement>('[data-cookie-notice]');
  if (!notice || wasDismissed()) return;

  let remaining = LIFETIME_MS;
  let startedAt = 0;
  let timer: number | undefined;
  let hovered = false;
  let focused = false;
  let closed = false;

  const dismiss = () => {
    if (closed) return;
    closed = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', sync);
    rememberDismissal();
    notice.remove();
  };

  // A tab opened in the background must not use up the notice before anyone sees it.
  const sync = () => {
    if (closed) return;
    const paused = hovered || focused || document.hidden;
    notice.toggleAttribute('data-paused', paused);
    if (paused && timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
      remaining -= performance.now() - startedAt;
    } else if (!paused && timer === undefined) {
      startedAt = performance.now();
      timer = window.setTimeout(dismiss, remaining);
    }
  };

  notice.addEventListener('mouseenter', () => {
    hovered = true;
    sync();
  });
  notice.addEventListener('mouseleave', () => {
    hovered = false;
    sync();
  });
  notice.addEventListener('focusin', () => {
    focused = true;
    sync();
  });
  notice.addEventListener('focusout', event => {
    focused = event.relatedTarget instanceof Node && notice.contains(event.relatedTarget);
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  notice.querySelectorAll('[data-cookie-dismiss]').forEach(button => button.addEventListener('click', dismiss));

  notice.hidden = false;
  sync();
}
