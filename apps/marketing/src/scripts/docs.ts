import {
  REACTIONS_ENDPOINT,
  isReaction,
  storageKey,
  type ReactionCounts,
  type ReactionId,
} from '@lib/reactions-contract';

interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: { title?: string } }>;
}
interface Pagefind {
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the reaction still counts, it just is not remembered.
  }
}

let pagefind: Promise<Pagefind> | undefined;
let failedLoads = 0;
function loadPagefind(): Promise<Pagefind> {
  // The index exists only in a build: Pagefind writes it into dist after Astro finishes.
  // Browsers remember a failed import, so a retry asks for a fresh URL.
  const retry = failedLoads > 0 ? `?attempt=${failedLoads}` : '';
  pagefind ??= import(/* @vite-ignore */ `${'/pagefind/'}pagefind.js${retry}`).then(module => module as Pagefind);
  pagefind.catch(() => {
    pagefind = undefined;
    failedLoads++;
  });
  return pagefind;
}

const cleanUrl = (url: string) => url.replace(/\.html$/, '').replace(/\/index$/, '') || '/';

const MIN_QUERY = 2;
const MAX_RESULTS = 8;

function message(text: string, retry?: () => void): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'result-empty';
  item.textContent = text;
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-retry';
    button.textContent = 'Try again';
    button.addEventListener('click', retry);
    item.append(' ', button);
  }
  return item;
}

function resultItem(result: Awaited<ReturnType<PagefindResult['data']>>): HTMLLIElement {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = cleanUrl(result.url);
  const title = document.createElement('span');
  title.className = 'result-title';
  title.textContent = result.meta.title ?? link.href;
  const excerpt = document.createElement('span');
  excerpt.className = 'result-excerpt';
  // Pagefind escapes the page text and adds only <mark> around matches.
  excerpt.innerHTML = result.excerpt;
  link.append(title, excerpt);
  item.append(link);
  return item;
}

function initSearch(): void {
  document.querySelectorAll<HTMLElement>('[data-docs-search]').forEach(root => {
    const input = root.querySelector<HTMLInputElement>('[data-search-input]');
    const list = root.querySelector<HTMLUListElement>('[data-search-results]');
    const status = root.querySelector<HTMLElement>('[data-search-status]');
    const clear = root.querySelector<HTMLButtonElement>('[data-search-clear]');
    if (!input || !list || !status || !clear) return;
    root.hidden = false;
    let latest = 0;
    let dismissed = false;

    const active = () => root.contains(document.activeElement);
    const show = (...items: HTMLLIElement[]) => {
      list.replaceChildren(...items);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      latest++;
      list.hidden = true;
      list.removeAttribute('aria-busy');
      input.setAttribute('aria-expanded', 'false');
    };

    const render = async () => {
      const query = input.value.trim();
      const ticket = ++latest;
      clear.hidden = input.value === '';
      list.removeAttribute('aria-busy');
      if (query.length < MIN_QUERY) {
        status.textContent = '';
        show(message('Results appear as you type, from two characters. Enter opens the first one.'));
        return;
      }
      list.setAttribute('aria-busy', 'true');
      show(message('Searching…'));
      status.textContent = 'Searching…';
      try {
        const engine = await loadPagefind();
        const found = await engine.search(query);
        const top = await Promise.all(found.results.slice(0, MAX_RESULTS).map(result => result.data()));
        if (ticket !== latest || !active()) return;
        list.removeAttribute('aria-busy');
        if (top.length === 0) show(message(`No guide matches “${query}” yet.`));
        else show(...top.map(resultItem));
        status.textContent = `${top.length} ${top.length === 1 ? 'result' : 'results'}`;
      } catch {
        if (ticket !== latest || !active()) return;
        list.removeAttribute('aria-busy');
        const retry = () => {
          input.focus();
          void render();
        };
        show(
          import.meta.env.DEV
            ? message('Search needs a build: run bun run build, then bun run preview.')
            : message('Search could not load. Check your connection.', retry),
        );
        status.textContent = 'Search could not load.';
      }
    };

    input.addEventListener('focus', () => {
      if (list.hidden && !dismissed) void render();
      dismissed = false;
    });
    input.addEventListener('input', () => void render());
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!list.hidden) close();
        else {
          input.value = '';
          clear.hidden = true;
        }
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        if (list.hidden) void render();
        list.querySelector<HTMLAnchorElement>('a')?.focus();
        event.preventDefault();
      } else if (event.key === 'Enter') {
        const first = list.hidden ? null : list.querySelector<HTMLAnchorElement>('a');
        if (first) window.location.assign(first.href);
        event.preventDefault();
      }
    });
    list.addEventListener('keydown', event => {
      const links = [...list.querySelectorAll<HTMLAnchorElement>('a')];
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (event.key === 'ArrowDown') links[Math.min(index + 1, links.length - 1)]?.focus();
      else if (event.key === 'ArrowUp') (index <= 0 ? input : links[index - 1])?.focus();
      else if (event.key === 'Escape') {
        close();
        dismissed = true;
        input.focus();
      } else return;
      event.preventDefault();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      input.focus();
      void render();
    });
    root.addEventListener('focusout', event => {
      if (!root.contains(event.relatedTarget as Node | null)) close();
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    const input = [...document.querySelectorAll<HTMLInputElement>('[data-search-input]')].find(
      element => element.offsetParent !== null,
    );
    if (!input) return;
    event.preventDefault();
    input.focus();
  });
}

function initToc(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  if (links.length === 0 || !('IntersectionObserver' in window)) return;
  const headings = [...new Set(links.map(link => link.dataset.tocLink))]
    .map(id => (id ? document.getElementById(id) : null))
    .filter((heading): heading is HTMLElement => heading !== null);
  const visible = new Set<string>();
  const mark = (id: string) =>
    links.forEach(link => link.setAttribute('aria-current', String(link.dataset.tocLink === id)));

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => (entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id)));
      const first = headings.find(heading => visible.has(heading.id));
      if (first) mark(first.id);
    },
    { rootMargin: '-24px 0px -65% 0px' },
  );
  headings.forEach(heading => observer.observe(heading));
  links.forEach(link =>
    link.addEventListener('click', () => {
      const details = link.closest('details');
      if (details) details.open = false;
    }),
  );
  if (headings[0]) mark(headings[0].id);
}

function initMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('[data-docs-menu]');
  if (!menu) return;
  const wide = window.matchMedia('(min-width: 1024px)');
  const sync = () => {
    menu.open = wide.matches;
  };
  sync();
  wide.addEventListener('change', sync);
}

function initCopyMarkdown(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-copy-markdown]');
  const label = button?.querySelector<HTMLElement>('[data-copy-label]');
  const status = document.querySelector<HTMLElement>('[data-copy-status]');
  if (!button || !label || !navigator.clipboard) return;
  const source = `/docs/${button.dataset.copyMarkdown}.md`;
  let markdown: Promise<string> | undefined;
  const load = () => (markdown ??= fetch(source).then(response => (response.ok ? response.text() : Promise.reject())));
  button.hidden = false;
  button.addEventListener('pointerenter', () => void load().catch(() => undefined), { once: true });
  button.addEventListener('focus', () => void load().catch(() => undefined), { once: true });

  let reset: number | undefined;
  button.addEventListener('click', async () => {
    let message = 'Copied';
    try {
      await navigator.clipboard.writeText(await load());
    } catch {
      markdown = undefined;
      message = 'Could not copy';
    }
    label.textContent = message;
    if (status) status.textContent = message === 'Copied' ? 'Markdown copied to the clipboard.' : message;
    window.clearTimeout(reset);
    reset = window.setTimeout(() => (label.textContent = 'Copy as Markdown'), 1800);
  });
}

function initCodeCopy(): void {
  if (!navigator.clipboard) return;
  document.querySelectorAll<HTMLPreElement>('.doc-content pre').forEach(pre => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy this code');
    button.addEventListener('click', async () => {
      const text = pre.querySelector('code')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Could not copy';
      }
      window.setTimeout(() => (button.textContent = 'Copy'), 1600);
    });
    pre.append(button);
  });
}

function initReactions(): void {
  const root = document.querySelector<HTMLElement>('[data-docs-reactions]');
  const article = root?.dataset.docsReactions;
  if (!root || !article) return;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-reaction]')];
  const status = root.querySelector<HTMLElement>('[data-reaction-status]');
  const stored = readStored(storageKey(article));
  let chosen: ReactionId | null = isReaction(stored) ? stored : null;
  let counts: ReactionCounts | null = null;

  const paint = () => {
    buttons.forEach(button => {
      const id = button.dataset.reaction as ReactionId;
      button.setAttribute('aria-pressed', String(id === chosen));
      const count = button.querySelector<HTMLElement>('[data-count]');
      if (count) count.textContent = counts ? String(counts[id]) : '–';
    });
  };
  const setBusy = (busy: boolean) => buttons.forEach(button => (button.disabled = busy));

  // Shown only once the counts load, so a missing or unconfigured API never leaves dead buttons.
  fetch(`${REACTIONS_ENDPOINT}?article=${encodeURIComponent(article)}`)
    .then(response => (response.ok ? response.json() : Promise.reject()))
    .then((body: { data: { counts: ReactionCounts } }) => {
      counts = body.data.counts;
      root.hidden = false;
      paint();
    })
    .catch(() => undefined);

  buttons.forEach(button =>
    button.addEventListener('click', async () => {
      const picked = button.dataset.reaction as ReactionId;
      const from = chosen;
      const to = picked === chosen ? null : picked;
      setBusy(true);
      try {
        const response = await fetch(REACTIONS_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ article, from, to }),
        });
        if (!response.ok) throw new Error(`reaction ${response.status}`);
        const body = (await response.json()) as { data: { counts: ReactionCounts } };
        counts = body.data.counts;
        chosen = to;
        writeStored(storageKey(article), to);
        if (status) status.textContent = to ? 'Thanks. Your reaction is saved.' : 'Reaction removed.';
        if (to && !reduceMotion.matches) button.animate([{ transform: 'scale(0.94)' }, { transform: 'none' }], 180);
      } catch {
        if (status) status.textContent = 'That did not save. Try again in a moment.';
      } finally {
        setBusy(false);
        paint();
      }
    }),
  );
}

initSearch();
initToc();
initMenu();
initCopyMarkdown();
initCodeCopy();
initReactions();
