import { describe, expect, test } from 'bun:test';
import { generateProjectKey, parseProjectKey } from '../src/index.ts';

describe('generateProjectKey', () => {
  test('takes the first letter of each word when there are several', () => {
    expect(generateProjectKey('Acme Corporation')).toBe('AC');
    expect(generateProjectKey('Partner Portal')).toBe('PP');
  });

  test('caps a generated key at four characters', () => {
    expect(generateProjectKey('Nothing Left Web App')).toBe('NLWA');
    expect(generateProjectKey('One Two Three Four Five Six')).toBe('OTTF');
  });

  test('takes the first three characters of a single word', () => {
    expect(generateProjectKey('Billing')).toBe('BIL');
  });

  test('takes the whole word when it is shorter than three characters', () => {
    expect(generateProjectKey('Go')).toBe('GO');
  });

  test('strips non-alphanumerics before splitting', () => {
    expect(generateProjectKey('Nothing-Left!')).toBe('NOT');
    expect(generateProjectKey('R&D Platform')).toBe('RP');
  });

  test('appends a digit on collision within the organisation', () => {
    expect(generateProjectKey('Partner Portal', new Set(['PP']))).toBe('PP2');
    expect(generateProjectKey('Partner Portal', new Set(['PP', 'PP2', 'PP3']))).toBe('PP4');
  });

  test('returns null when the name cannot yield two characters', () => {
    expect(generateProjectKey('X')).toBeNull();
    expect(generateProjectKey('!!!')).toBeNull();
    expect(generateProjectKey('')).toBeNull();
  });
});

describe('parseProjectKey', () => {
  test('folds a typed key up to its canonical form', () => {
    expect(parseProjectKey('pp')).toBe('PP');
    expect(parseProjectKey('  Nlwa ')).toBe('NLWA');
    expect(parseProjectKey('A1B2C3D4E5')).toBe('A1B2C3D4E5');
  });

  test('refuses anything that is not 2-10 alphanumerics', () => {
    expect(parseProjectKey('X')).toBeNull();
    expect(parseProjectKey('A1B2C3D4E5F')).toBeNull();
    expect(parseProjectKey('PP-1')).toBeNull();
    expect(parseProjectKey('')).toBeNull();
  });
});
