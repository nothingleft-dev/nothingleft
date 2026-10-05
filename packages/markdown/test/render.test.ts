import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from '../src/index.ts';

const render = (markdown: string) =>
  renderMarkdown(markdown, { mentionHref: username => `/people/${username}`, issueHref: key => `/issue/${key}` });

describe('renderMarkdown', () => {
  test('renders CommonMark blocks and inline formatting', () => {
    const html = render('# Title\n\nSome **bold**, _italic_ and `code`.\n\n> quoted\n\n- one\n- two\n\n1. first');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
  });

  test('renders GFM strikethrough, tables and autolinks', () => {
    const html = render('~~gone~~\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nwww.example.com');
    expect(html).toContain('<del>gone</del>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('<a href="http://www.example.com"');
  });

  test('renders task lists as disabled checkboxes numbered in document order', () => {
    const html = render('- [ ] open\n- [x] done\n\n* [ ] later');
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled data-task="0"> open</li>');
    expect(html).toContain('<input type="checkbox" checked disabled data-task="1"> done');
    expect(html).toContain('data-task="2"');
  });

  test('highlights fenced code blocks with a known language', () => {
    const html = render('```ts\nconst x: number = 1;\n```');
    expect(html).toContain('<pre><code class="hljs language-ts">');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  test('leaves fenced code with an unknown or missing language unhighlighted', () => {
    expect(render('```\nplain\n```')).toContain('<pre><code>plain\n</code></pre>');
    const unknown = render('```nosuchlang\nplain\n```');
    expect(unknown).toContain('<pre><code class="hljs language-nosuchlang">plain\n</code></pre>');
    expect(unknown).not.toContain('hljs-');
  });

  test('links @mentions to the supplied href', () => {
    expect(render('ping @alex.lee and @casey-m, thanks')).toBe(
      '<p>ping <a href="/people/alex.lee" class="mention" data-mention="alex.lee">@alex.lee</a> and <a href="/people/casey-m" class="mention" data-mention="casey-m">@casey-m</a>, thanks</p>',
    );
  });

  test('links issue keys to the supplied href, uppercase only', () => {
    expect(render('blocked on PMS-118 (see pms-119)')).toBe(
      '<p>blocked on <a href="/issue/PMS-118" class="issue-key" data-issue-key="PMS-118">PMS-118</a> (see pms-119)</p>',
    );
  });

  test('renders mentions as plain spans when no mention href is configured', () => {
    expect(renderMarkdown('hi @alex')).toBe('<p>hi <span class="mention" data-mention="alex">@alex</span></p>');
  });

  test('defaults issue links to /issue/KEY', () => {
    expect(renderMarkdown('PMS-1')).toBe(
      '<p><a href="/issue/PMS-1" class="issue-key" data-issue-key="PMS-1">PMS-1</a></p>',
    );
  });

  test('marks the keys the caller reports as resolved', () => {
    expect(renderMarkdown('PMS-1 and PMS-2', { isResolvedIssue: key => key === 'PMS-2' })).toBe(
      '<p><a href="/issue/PMS-1" class="issue-key" data-issue-key="PMS-1">PMS-1</a> and ' +
        '<a href="/issue/PMS-2" class="issue-key resolved" data-issue-key="PMS-2">PMS-2</a></p>',
    );
  });

  test('does not linkify inside code, links or autolinked emails', () => {
    expect(render('`@alex` and `PMS-1`')).toBe('<p><code>@alex</code> and <code>PMS-1</code></p>');
    expect(render('[@alex](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">@alex</a></p>',
    );
    expect(render('mail alex@example.com')).not.toContain('class="mention"');
    expect(render('```\nPMS-1 @alex\n```')).not.toContain('<a');
  });

  test('opens external links in a new tab with rel protection, internal links in place', () => {
    const html = render('[site](https://example.com) and [home](/dashboard)');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">site</a>');
    expect(html).toContain('<a href="/dashboard">home</a>');
  });

  test('renders images with alt text', () => {
    expect(render('![diagram](https://cdn.example.com/a.png)')).toBe(
      '<p><img src="https://cdn.example.com/a.png" alt="diagram" loading="lazy"></p>',
    );
  });

  test('renders an empty document as an empty string', () => {
    expect(render('')).toBe('');
    expect(render('   \n\n')).toBe('');
  });
});

describe('renderMarkdown image sizes', () => {
  const url = 'https://files.example.com/6f1c/login-bug.png';

  test('sets the stored width and height on a known image', () => {
    const html = renderMarkdown(`![login-bug.png](${url})`, {
      imageSize: src => (src === url ? { width: 1280, height: 720 } : null),
    });
    expect(html).toContain(`<img src="${url}" alt="login-bug.png" loading="lazy" width="1280" height="720">`);
  });

  test('leaves an unknown image unsized and lazy', () => {
    const html = renderMarkdown('![x](https://example.com/x.png)', { imageSize: () => null });
    expect(html).toContain('<img src="https://example.com/x.png" alt="x" loading="lazy">');
  });

  test('ignores sizes written into the source', () => {
    const html = renderMarkdown('<img src="https://example.com/x.png" width="9999" height="1">');
    expect(html).not.toContain('9999');
  });
});
