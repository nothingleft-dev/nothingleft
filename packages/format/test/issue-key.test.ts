import { describe, expect, test } from 'bun:test';
import { formatIssueKey, parseIssueKey } from '../src/index.ts';

describe('parseIssueKey', () => {
  test('splits a key into its project key and number', () => {
    expect(parseIssueKey('PMS-118')).toEqual({ projectKey: 'PMS', number: 118 });
  });

  test('accepts digits in the project key', () => {
    expect(parseIssueKey('WEB2-7')).toEqual({ projectKey: 'WEB2', number: 7 });
  });

  test('uppercases what the user typed', () => {
    expect(parseIssueKey(' pms-118 ')).toEqual({ projectKey: 'PMS', number: 118 });
  });

  test('rejects a project key outside 2-10 characters', () => {
    expect(parseIssueKey('P-1')).toBeNull();
    expect(parseIssueKey('ELEVENCHARS-1')).toBeNull();
  });

  test('rejects a missing, zero or non-numeric issue number', () => {
    expect(parseIssueKey('PMS-')).toBeNull();
    expect(parseIssueKey('PMS')).toBeNull();
    expect(parseIssueKey('PMS-0')).toBeNull();
    expect(parseIssueKey('PMS-12a')).toBeNull();
  });

  test('rejects a second hyphen', () => {
    expect(parseIssueKey('PMS-1-2')).toBeNull();
  });
});

describe('formatIssueKey', () => {
  test('joins a project key and a number', () => {
    expect(formatIssueKey('PMS', 118)).toBe('PMS-118');
  });

  test('uppercases the project key', () => {
    expect(formatIssueKey('pms', 118)).toBe('PMS-118');
  });

  test('round-trips through parseIssueKey', () => {
    const parsed = parseIssueKey('PMS-118');
    expect(parsed && formatIssueKey(parsed.projectKey, parsed.number)).toBe('PMS-118');
  });
});
