import { describe, expect, test } from 'bun:test';
import { extractIssueKeys, extractMentions, extractReferences } from '../src/index.ts';

describe('extractMentions', () => {
  test('collects unique usernames in order of first appearance', () => {
    expect(extractMentions('cc @alex and @casey, then @alex again')).toEqual(['alex', 'casey']);
  });

  test('accepts dots, underscores and hyphens inside a username', () => {
    expect(extractMentions('@alex.lee @a_b @c-d')).toEqual(['alex.lee', 'a_b', 'c-d']);
  });

  test('drops trailing punctuation that cannot end a username', () => {
    expect(extractMentions('thanks @alex. and @casey_')).toEqual(['alex', 'casey']);
  });

  test('ignores email addresses and mid-word @', () => {
    expect(extractMentions('mail alex@example.com or foo@bar')).toEqual([]);
  });

  test('ignores mentions inside code, code blocks and link text', () => {
    expect(extractMentions('`@code` and\n\n```\n@block\n```\n\n[@linked](https://x.example) @real')).toEqual(['real']);
  });

  test('keeps the username as typed', () => {
    expect(extractMentions('@Alex')).toEqual(['Alex']);
  });

  test('handles a mention at the very start and end', () => {
    expect(extractMentions('@a hello @b')).toEqual(['a', 'b']);
  });
});

describe('extractIssueKeys', () => {
  test('collects unique keys in order of first appearance', () => {
    expect(extractIssueKeys('PMS-118 blocks PMS-119; PMS-118 again')).toEqual(['PMS-118', 'PMS-119']);
  });

  test('requires an uppercase key with at least one letter', () => {
    expect(extractIssueKeys('pms-118 2026-9 10-5 UTF-8 WEB2-7')).toEqual(['UTF-8', 'WEB2-7']);
  });

  test('rejects keys glued to other word characters', () => {
    expect(extractIssueKeys('xPMS-118 PMS-118x PMS-118-2 PMS-0 PMS-01')).toEqual([]);
  });

  test('accepts keys wrapped in punctuation', () => {
    expect(extractIssueKeys('(PMS-1), [PMS-2]: "PMS-3".')).toEqual(['PMS-1', 'PMS-2', 'PMS-3']);
  });

  test('ignores keys inside code and links', () => {
    expect(extractIssueKeys('`PMS-1` [PMS-2](https://x.example) https://x.example/PMS-3 PMS-4')).toEqual(['PMS-4']);
  });
});

describe('extractReferences', () => {
  test('returns both in one pass', () => {
    expect(extractReferences('@alex see PMS-7')).toEqual({ mentions: ['alex'], issueKeys: ['PMS-7'] });
  });

  test('returns empty lists for an empty document', () => {
    expect(extractReferences('')).toEqual({ mentions: [], issueKeys: [] });
  });
});
