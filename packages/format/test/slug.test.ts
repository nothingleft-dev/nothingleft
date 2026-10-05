import { describe, expect, test } from 'bun:test';
import {
  articleSlug,
  customFieldSlug,
  isCustomFieldSlug,
  slugify,
  uniqueArticleSlug,
  uniqueSlug,
} from '../src/index.ts';

describe('slugify', () => {
  test('lowercases and joins words with a hyphen', () => {
    expect(slugify('Needs Review')).toBe('needs-review');
  });

  test('collapses runs of whitespace', () => {
    expect(slugify('  Needs   \t Review  ')).toBe('needs-review');
  });

  test('keeps a colon so namespaced tags survive', () => {
    expect(slugify('Area:Billing')).toBe('area:billing');
  });

  test('keeps dots, underscores and hyphens', () => {
    expect(slugify('v1.2_beta-rc')).toBe('v1.2_beta-rc');
  });

  test('strips everything outside the allowed set', () => {
    expect(slugify('Payment/Outage (P1)!')).toBe('paymentoutage-p1');
  });

  test('collapses repeated hyphens and trims them from the edges', () => {
    expect(slugify('-- Needs -- Review --')).toBe('needs-review');
  });

  test('is idempotent', () => {
    expect(slugify(slugify('Needs Review'))).toBe('needs-review');
  });

  test('returns an empty string when nothing survives', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});

describe('uniqueSlug', () => {
  test('slugifies, then suffixes on collision', () => {
    expect(uniqueSlug('Partner Portal', new Set())).toBe('partner-portal');
    expect(uniqueSlug('Partner Portal', new Set(['partner-portal', 'partner-portal-2']))).toBe('partner-portal-3');
  });
});

describe('customFieldSlug', () => {
  test.each([
    ['Severity', 'severity'],
    ['Due at (UTC)', 'due-at-utc'],
    ['  Customer  Tier ', 'customer-tier'],
    ['Café crème', 'cafe-creme'],
    ['3 Root cause', 'root-cause'],
    ['a'.repeat(50), 'a'.repeat(40)],
  ])('%s → %s', (name, slug) => {
    expect(customFieldSlug(name)).toBe(slug);
  });

  test('a name with no letters has no slug', () => {
    expect(customFieldSlug('123 !!')).toBeNull();
  });

  test('isCustomFieldSlug', () => {
    expect(isCustomFieldSlug('severity')).toBe(true);
    expect(isCustomFieldSlug('Severity')).toBe(false);
    expect(isCustomFieldSlug('due_date')).toBe(false);
    expect(isCustomFieldSlug('1st')).toBe(false);
  });
});

describe('articleSlug', () => {
  test.each([
    ['Getting started', 'getting-started'],
    ['  API reference: v2 ', 'api-reference-v2'],
    ['Überblick & Ablauf', 'uberblick-ablauf'],
    ['--Restoring a failed sync--', 'restoring-a-failed-sync'],
    ['a.b:c', 'a-b-c'],
    ['日本語', ''],
  ])('%s → %s', (title, slug) => {
    expect(articleSlug(title)).toBe(slug);
  });

  test('is at most 80 characters and never ends in a hyphen', () => {
    const slug = articleSlug(`${'word '.repeat(15)}x`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueArticleSlug', () => {
  test('suffixes a taken slug', () => {
    expect(uniqueArticleSlug('Overview', new Set(['overview', 'overview-2']))).toBe('overview-3');
  });

  test('falls back to article when the title has no ASCII letters or digits', () => {
    expect(uniqueArticleSlug('日本語', new Set())).toBe('article');
  });

  test('keeps a suffixed slug within 80 characters', () => {
    const long = 'a'.repeat(80);
    expect(uniqueArticleSlug(long, new Set([long]))).toBe(`${'a'.repeat(78)}-2`);
  });
});
