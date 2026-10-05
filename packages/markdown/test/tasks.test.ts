import { describe, expect, test } from 'bun:test';
import { toggleTaskItem } from '../src/index.ts';

describe('toggleTaskItem', () => {
  const source = '# Plan\n\n- [ ] first\n- [x] second\n  - [X] nested\n\ntext\n\n* [ ] fourth';

  test('checks the nth task in document order', () => {
    expect(toggleTaskItem(source, 0, true)).toBe(source.replace('- [ ] first', '- [x] first'));
    expect(toggleTaskItem(source, 3, true)).toBe(source.replace('* [ ] fourth', '* [x] fourth'));
  });

  test('unchecks, normalising an uppercase X', () => {
    expect(toggleTaskItem(source, 1, false)).toBe(source.replace('- [x] second', '- [ ] second'));
    expect(toggleTaskItem(source, 2, false)).toBe(source.replace('- [X] nested', '- [ ] nested'));
  });

  test('returns the source unchanged when the index does not exist', () => {
    expect(toggleTaskItem(source, 9, true)).toBe(source);
    expect(toggleTaskItem(source, -1, true)).toBe(source);
  });

  test('ignores brackets that are not task markers', () => {
    const md = '- [link](https://x.example)\n- [ ] real';
    expect(toggleTaskItem(md, 0, true)).toBe('- [link](https://x.example)\n- [x] real');
  });

  test('handles the checkbox inside an ordered list', () => {
    expect(toggleTaskItem('1. [ ] a\n2. [ ] b', 1, true)).toBe('1. [ ] a\n2. [x] b');
  });
});
