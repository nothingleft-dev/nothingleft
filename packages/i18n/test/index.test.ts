import { describe, expect, test } from 'bun:test';
import { errorKey, hasMessage, t } from '../src/index.ts';

describe('t', () => {
  test('resolves a plain key', () => {
    expect(t('error.not_found')).toBe('The requested resource was not found.');
  });

  test('substitutes named parameters', () => {
    expect(t('error.project.not_found', { key: 'PMS' })).toBe('No project with key PMS.');
  });

  test('agrees a plural with its count and groups thousands', () => {
    expect(t('error.config.in_use', { name: 'Done', count: 1 })).toContain('used by 1 item.');
    expect(t('error.config.in_use', { name: 'Done', count: 1284 })).toContain('used by 1,284 items.');
  });

  test('leaves unknown placeholders untouched', () => {
    expect(t('error.internal', { nope: 1 })).toBe(t('error.internal'));
  });
});

describe('errorKey', () => {
  test('prefixes codes with error.', () => {
    expect(errorKey('not_found')).toBe('error.not_found');
    expect(hasMessage(errorKey('not_found'))).toBe(true);
  });
});
