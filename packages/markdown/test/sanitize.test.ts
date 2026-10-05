import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from '../src/index.ts';

const vectors: Array<[name: string, markdown: string, forbidden: Array<string | RegExp>]> = [
  ['script tag', 'hi <script>alert(1)</script>', ['<script']],
  ['inline event handler', '<img src=x onerror="alert(1)">', [/\son\w+=/i, '<img']],
  ['javascript: link', '[click](javascript:alert(1))', ['javascript:']],
  ['javascript: link with whitespace and case', '[click](JaVaScRiPt:alert(1))', ['alert']],
  ['data: image', '![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)', ['data:']],
  ['vbscript: link', '[x](vbscript:msgbox(1))', ['vbscript']],
  ['iframe', '<iframe src="https://evil.example"></iframe>', ['<iframe']],
  ['object and embed', '<object data="x"></object><embed src="x">', ['<object', '<embed']],
  ['style block', '<style>body{display:none}</style>', ['<style']],
  ['style attribute', '<p style="position:fixed">x</p>', ['style=']],
  ['form and inputs', '<form action="https://evil.example"><input name="q"></form>', ['<form', 'name=']],
  ['svg with script', '<svg><script>alert(1)</script></svg>', ['<svg', '<script']],
  ['math with href', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>', ['<math', 'javascript']],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">', ['<meta']],
  ['base tag', '<base href="https://evil.example/">', ['<base']],
  ['link tag', '<link rel="stylesheet" href="https://evil.example/x.css">', ['<link']],
  ['id clobbering', '<a id="location">x</a>', ['id="location"']],
  ['target=_blank without rel via raw HTML', '<a href="https://x.example" target="_blank">x</a>', ['<a']],
  ['srcdoc iframe', '<iframe srcdoc="<script>alert(1)</script>"></iframe>', ['srcdoc']],
  ['html comment tricks', '<!--><script>alert(1)</script>-->', ['<script']],
  ['encoded javascript href', '[x](&#106;avascript:alert(1))', ['javascript']],
  ['unclosed tag', '<img src=x onerror=alert(1)//', ['<img']],
  ['nested autolink', '<https://x.example/"><script>alert(1)</script>>', ['<script']],
  ['reference-style javascript link', '[x][1]\n\n[1]: javascript:alert(1)', ['javascript']],
  ['image with onload', '![x](https://x.example/a.png"onload="alert(1))', [/\son\w+=/i, '"onload']],
];

describe('renderMarkdown sanitises every XSS vector', () => {
  test.each(vectors)('%s', (_name, markdown, forbidden) => {
    const html = renderMarkdown(markdown);
    for (const needle of forbidden) {
      if (needle instanceof RegExp) expect(html).not.toMatch(needle);
      else expect(html.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  test('drops raw HTML tags, keeping their text, rather than passing a sanitised subset through', () => {
    expect(renderMarkdown('before <b>bold</b> after')).toBe('<p>before bold after</p>');
    expect(renderMarkdown('<div>block</div>')).toBe('');
  });

  test('keeps safe protocols on links and images', () => {
    expect(renderMarkdown('[m](mailto:a@example.com) ![i](https://x.example/a.png)')).toBe(
      '<p><a href="mailto:a@example.com">m</a> <img src="https://x.example/a.png" alt="i" loading="lazy"></p>',
    );
  });

  test('escapes text that looks like markup', () => {
    expect(renderMarkdown('a < b && c > d')).toBe('<p>a &#x3C; b &#x26;&#x26; c > d</p>');
  });
});
