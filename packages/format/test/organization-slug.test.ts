import { describe, expect, test } from 'bun:test';
import { generateOrganizationSlug, parseOrganizationSlug } from '../src/index.ts';

describe('parseOrganizationSlug', () => {
  test('lowercases and accepts letters, digits and single hyphens', () => {
    expect(parseOrganizationSlug('Acme-Labs')).toBe('acme-labs');
    expect(parseOrganizationSlug('a1')).toBe('a1');
  });

  test('refuses edge or doubled hyphens, other punctuation, and lengths outside 2–48', () => {
    expect(parseOrganizationSlug('-acme')).toBeNull();
    expect(parseOrganizationSlug('acme-')).toBeNull();
    expect(parseOrganizationSlug('ac--me')).toBeNull();
    expect(parseOrganizationSlug('ac.me')).toBeNull();
    expect(parseOrganizationSlug('a')).toBeNull();
    expect(parseOrganizationSlug('a'.repeat(48))).toBe('a'.repeat(48));
    expect(parseOrganizationSlug('a'.repeat(49))).toBeNull();
  });
});

describe('generateOrganizationSlug', () => {
  test('derives a hyphenated slug from the name', () => {
    expect(generateOrganizationSlug('Acme Corporation')).toBe('acme-corporation');
    expect(generateOrganizationSlug('R&D  Labs, Inc.')).toBe('rd-labs-inc');
  });

  test('returns null when the name yields fewer than two characters', () => {
    expect(generateOrganizationSlug('X')).toBeNull();
    expect(generateOrganizationSlug('!!!')).toBeNull();
  });

  test('appends -2, -3… on collision and stays within 48 characters', () => {
    expect(generateOrganizationSlug('Acme', new Set(['acme']))).toBe('acme-2');
    expect(generateOrganizationSlug('Acme', new Set(['acme', 'acme-2']))).toBe('acme-3');
    const long = 'word '.repeat(20);
    const first = generateOrganizationSlug(long)!;
    expect(first.length).toBeLessThanOrEqual(48);
    const second = generateOrganizationSlug(long, new Set([first]))!;
    expect(second.endsWith('-2')).toBe(true);
    expect(parseOrganizationSlug(second)).toBe(second);
  });
});
