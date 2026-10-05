import { describe, expect, test } from 'bun:test';
import { formatBytes } from '../src/bytes.ts';

describe('formatBytes', () => {
  test('binary units, one decimal below ten', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 GB');
    expect(formatBytes(4.85 * 1024 ** 3)).toBe('4.9 GB');
    expect(formatBytes(-5)).toBe('0 B');
  });
});
