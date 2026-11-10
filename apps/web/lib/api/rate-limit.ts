const FALLBACK_WAIT_S = 60;

interface RateLimit {
  /** Epoch milliseconds the limit lifts at; zero when not limited. */
  until: number;
  secondsLeft: number;
  /** The wait announced when the limit began, for progress. */
  totalSeconds: number;
  /** The limit the API last reported, when it did. */
  perMinute: number | null;
}

const IDLE: RateLimit = { until: 0, secondsLeft: 0, totalSeconds: 0, perMinute: null };

let state = IDLE;
let ticker: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

const positive = (value: string | null) => {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n > 0 ? n : null;
};

function tick() {
  const secondsLeft = Math.max(0, Math.ceil((state.until - Date.now()) / 1000));
  if (secondsLeft === 0) {
    clearInterval(ticker);
    ticker = undefined;
    state = { ...IDLE, perMinute: state.perMinute };
  } else if (secondsLeft !== state.secondsLeft) {
    state = { ...state, secondsLeft };
  } else {
    return;
  }
  listeners.forEach(listener => listener());
}

// Every tab of one browser shares the session, and so the limit: one tab's 429 holds them all.
const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('nl-rate-limit') : null;

function limitUntil(until: number, perMinute: number | null) {
  if (until <= state.until) return false;
  state = {
    until,
    secondsLeft: 0,
    totalSeconds: Math.ceil((until - Date.now()) / 1000),
    perMinute: perMinute ?? state.perMinute,
  };
  ticker ??= setInterval(tick, 250);
  tick();
  return true;
}

channel?.addEventListener('message', (event: MessageEvent<{ until: number; perMinute: number | null }>) => {
  limitUntil(event.data.until, event.data.perMinute);
});

/** Seconds from `Retry-After`; `X-RateLimit-Reset` carries the same figure when a proxy drops the first. */
export function noteRateLimited(headers: Headers) {
  const seconds = Math.ceil(
    positive(headers.get('retry-after')) ?? positive(headers.get('x-ratelimit-reset')) ?? FALLBACK_WAIT_S,
  );
  const until = Date.now() + seconds * 1000;
  const perMinute = positive(headers.get('x-ratelimit-limit'));
  if (limitUntil(until, perMinute)) channel?.postMessage({ until, perMinute });
}

export const rateLimitState = () => state;

export function untilLifted(signal?: AbortSignal): Promise<void> {
  if (!isRateLimitedNow()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      unsubscribe();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      done();
      reject(signal!.reason);
    };
    const unsubscribe = subscribeRateLimit(() => {
      if (state.until) return;
      done();
      resolve();
    });
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export const isRateLimitedNow = () => state.until > Date.now();

export function subscribeRateLimit(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const RATE_LIMIT_IDLE = IDLE;
