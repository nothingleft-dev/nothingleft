import { describe, expect, test } from 'bun:test';
import { markdownExcerpt, markdownPlainText } from '../src/index.ts';

describe('markdownPlainText', () => {
  test('drops markup, links keep their text, images and URLs vanish', () => {
    expect(
      markdownPlainText('# Title\n\nSome **bold** [link](https://x.test) and `code`.\n\n![alt](https://x.test/a.png)'),
    ).toBe('Title Some bold link and code.');
  });

  test('list items and headings stay apart', () => {
    expect(markdownPlainText('## One\n- a\n- b')).toBe('One a b');
  });
});

describe('markdownExcerpt', () => {
  const long = `${'Intro words here. '.repeat(30)}The payment outage started at noon. ${'Tail words here. '.repeat(30)}`;

  test('a short document is returned whole', () => {
    expect(markdownExcerpt('Just a *line*.')).toBe('Just a line.');
  });

  test('a long one starts at the beginning without terms', () => {
    const out = markdownExcerpt(long, [], 60);
    expect(out.startsWith('Intro words here.')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(62);
  });

  test('centres on the first matching term, by prefix', () => {
    const out = markdownExcerpt(long, ['outages'], 80);
    expect(out).toContain('payment outage started');
    expect(out.startsWith('…')).toBe(true);
  });
});
