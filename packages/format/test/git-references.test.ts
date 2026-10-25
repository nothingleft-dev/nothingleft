import { describe, expect, test } from 'bun:test';
import { findIssueReferences, isRevert, MAX_REFERENCES_PER_TEXT } from '../src/git-references.ts';

const keys = ['PH', 'API'];
const found = (text: string, opts: Parameters<typeof findIssueReferences>[2] = {}) =>
  findIssueReferences(text, keys, opts).references.map(r => `${r.key}${r.closing ? '!' : ''}`);

describe('findIssueReferences', () => {
  test('matches a key however it is wrapped, in any case', () => {
    expect(found('[PH-675] fix login')).toEqual(['PH-675']);
    expect(found('see (ph-675)')).toEqual(['PH-675']);
    expect(found('feat/ph-675-login')).toEqual(['PH-675']);
    expect(found('PH-675: redirect')).toEqual(['PH-675']);
    expect(found('api-7')).toEqual(['API-7']);
  });

  test('a key glued to other text is not a reference', () => {
    expect(found('v1.0-alpha-ph-675')).toEqual([]);
    expect(found('path/ph-675x')).toEqual([]);
    expect(found('ph-675/notes')).toEqual([]);
    expect(found('xph-675')).toEqual([]);
    expect(found('ph-675_fix')).toEqual([]);
  });

  test('the whole number is read, so PH-6750 is not PH-675', () => {
    expect(found('ph-6750')).toEqual(['PH-6750']);
  });

  test('only the given project keys match, and a regex character in a key is literal', () => {
    expect(found('OTHER-1 PH-2')).toEqual(['PH-2']);
    expect(findIssueReferences('A.B-1 AXB-1', ['A.B']).references.map(r => r.key)).toEqual(['A.B-1']);
    expect(findIssueReferences('PH-1', []).references).toEqual([]);
  });

  test('each reference once, in order of first appearance; closing wins', () => {
    expect(found('PH-2 then PH-1, and later fixes PH-2')).toEqual(['PH-2!', 'PH-1']);
  });

  test('a closing keyword closes its own run of keys only', () => {
    expect(found('Fixes PH-1, PH-2 and PH-3')).toEqual(['PH-1!', 'PH-2!', 'PH-3!']);
    expect(found('Fixes PH-1 + PH-2')).toEqual(['PH-1!', 'PH-2']);
    expect(found('closes: api-7')).toEqual(['API-7!']);
    for (const word of [
      'close',
      'closed',
      'fix',
      'fixed',
      'resolve',
      'resolves',
      'resolved',
      'implement',
      'implements',
      'implemented',
    ]) {
      expect(found(`${word} PH-9`)).toEqual(['PH-9!']);
    }
    expect(found('prefix PH-9')).toEqual(['PH-9']);
  });

  test('our own issue URLs count', () => {
    const base = 'https://work.example.com';
    expect(found(`see ${base}/issue/PH-675/login-loops`, { issueUrlBase: base })).toEqual(['PH-675']);
    expect(found('see https://elsewhere.example/issue/PH-675/x', { issueUrlBase: base })).toEqual([]);
  });

  test('code is not a reference when asked to skip it', () => {
    const body = 'Fixes PH-1\n```\nconst id = "PH-2"\n```\nand `PH-3` inline, PH-4 plain';
    expect(found(body, { skipCode: true })).toEqual(['PH-1!', 'PH-4']);
    expect(found(body)).toEqual(['PH-1!', 'PH-2', 'PH-3', 'PH-4']);
  });

  test('a wall of keys is capped and says so', () => {
    const wall = Array.from({ length: 80 }, (_, i) => `PH-${i + 1}`).join(' ');
    const result = findIssueReferences(wall, keys);
    expect(result.references.length).toBe(MAX_REFERENCES_PER_TEXT);
    expect(result.truncated).toBe(true);
    expect(findIssueReferences('PH-1', keys).truncated).toBe(false);
  });

  test('each reference carries its project key and number', () => {
    expect(findIssueReferences('ph-12', keys).references).toEqual([
      { key: 'PH-12', project_key: 'PH', number: 12, closing: false },
    ]);
  });
});

describe('isRevert', () => {
  test('a revert by its title or its branch', () => {
    expect(isRevert('Revert "API-7: Fix login"', 'feature')).toBe(true);
    expect(isRevert('Revert: API-7', 'feature')).toBe(true);
    expect(isRevert('Fix', 'revert-42-feat')).toBe(true);
    expect(isRevert('Fix', 'revert/feat')).toBe(true);
    expect(isRevert('Reverting the cache change was wrong', 'main')).toBe(false);
  });
});
