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

let pagefind: Promise<Pagefind | null> | undefined;
function loadPagefind(): Promise<Pagefind | null> {
  // The index exists only in a build: Pagefind writes it into dist after Astro finishes.
  pagefind ??= import(/* @vite-ignore */ `${'/pagefind/'}pagefind.js`).then(
    module => module as Pagefind,
    () => null,
  );
  return pagefind;
}

const cleanUrl = (url: string) => url.replace(/\.html$/, '').replace(/\/index$/, '') || '/';

function initSearch(): void {
  document.querySelectorAll<HTMLElement>('[data-docs-search]').forEach(root => {
    const input = root.querySelector<HTMLInputElement>('[data-search-input]');
    const list = root.querySelector<HTMLUListElement>('[data-search-results]');
    const status = root.querySelector<HTMLElement>('[data-search-status]');
    if (!input || !list || !status) return;
    root.hidden = false;
    let latest = 0;

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    };
    const render = async () => {
      const query = input.value.trim();
      const ticket = ++latest;
      if (query.length < 2) {
        list.replaceChildren();
        close();
        status.textContent = '';
        return;
      }
      const engine = await loadPagefind();
      if (ticket !== latest) return;
      if (!engine) {
        list.innerHTML = '<li class="result-empty">Search works on the published site.</li>';
        list.hidden = false;
        return;
      }
      const found = await engine.search(query);
      const top = await Promise.all(found.results.slice(0, 8).map(result => result.data()));
      if (ticket !== latest) return;
      list.replaceChildren(
        ...top.map(result => {
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
        }),
      );
      if (top.length === 0) list.innerHTML = '<li class="result-empty">No guide matches that yet.</li>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      status.textContent = `${top.length} ${top.length === 1 ? 'result' : 'results'}`;
    };

    input.addEventListener('focus', () => void loadPagefind(), { once: true });
    input.addEventListener('input', () => void render());
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        input.value = '';
        void render();
      }
      if (event.key === 'ArrowDown') {
        list.querySelector<HTMLAnchorElement>('a')?.focus();
        event.preventDefault();
      }
    });
    list.addEventListener('keydown', event => {
      const links = [...list.querySelectorAll<HTMLAnchorElement>('a')];
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (event.key === 'ArrowDown') links[Math.min(index + 1, links.length - 1)]?.focus();
      else if (event.key === 'ArrowUp') (index <= 0 ? input : links[index - 1])?.focus();
      else if (event.key === 'Escape') input.focus();
      else return;
      event.preventDefault();
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
    { rootMargin: '-80px 0px -65% 0px' },
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

  root.hidden = false;
  paint();
  fetch(`${REACTIONS_ENDPOINT}?article=${encodeURIComponent(article)}`)
    .then(response => (response.ok ? response.json() : Promise.reject()))
    .then((body: { data: { counts: ReactionCounts } }) => {
      counts = body.data.counts;
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
