import { describe, expect, test } from 'bun:test';
import { MARKDOWN_HARD_LIMIT_BYTES, MARKDOWN_SOFT_LIMIT_BYTES } from '@nothingleft/types';
import { checkMarkdownSize, markdownByteLength } from '../src/index.ts';

describe('markdownByteLength', () => {
  test('counts UTF-8 bytes, not characters', () => {
    expect(markdownByteLength('abc')).toBe(3);
    expect(markdownByteLength('é')).toBe(2);
    expect(markdownByteLength('😀')).toBe(4);
  });
});

describe('checkMarkdownSize', () => {
  test('is ok below the soft limit', () => {
    expect(checkMarkdownSize('a'.repeat(MARKDOWN_SOFT_LIMIT_BYTES - 1))).toEqual({
      bytes: MARKDOWN_SOFT_LIMIT_BYTES - 1,
      level: 'ok',
    });
  });

  test('warns from the soft limit up to the hard limit', () => {
    expect(checkMarkdownSize('a'.repeat(MARKDOWN_SOFT_LIMIT_BYTES)).level).toBe('warning');
    expect(checkMarkdownSize('a'.repeat(MARKDOWN_HARD_LIMIT_BYTES)).level).toBe('warning');
  });

  test('rejects above the hard limit', () => {
    expect(checkMarkdownSize('a'.repeat(MARKDOWN_HARD_LIMIT_BYTES + 1))).toEqual({
      bytes: MARKDOWN_HARD_LIMIT_BYTES + 1,
      level: 'too_large',
    });
  });

  test('the limits are 64KB and 256KB', () => {
    expect(MARKDOWN_SOFT_LIMIT_BYTES).toBe(65536);
    expect(MARKDOWN_HARD_LIMIT_BYTES).toBe(262144);
  });
});
