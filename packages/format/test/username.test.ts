import { describe, expect, test } from 'bun:test';
import { formatUsername, parseUsername, usernameFromEmail } from '../src/index.ts';

describe('parseUsername', () => {
  test('accepts letters, digits, dot, underscore and hyphen, keeping the case typed', () => {
    expect(parseUsername('Alex')).toBe('Alex');
    expect(parseUsername('alex.lee')).toBe('alex.lee');
    expect(parseUsername('a_b-c')).toBe('a_b-c');
    expect(parseUsername('x')).toBe('x');
  });

  test('strips one leading @ and surrounding whitespace', () => {
    expect(parseUsername('  @alex ')).toBe('alex');
  });

  test('refuses a punctuation mark at either end, spaces, and anything beyond 39 characters', () => {
    expect(parseUsername('.alex')).toBeNull();
    expect(parseUsername('alex-')).toBeNull();
    expect(parseUsername('rau nak')).toBeNull();
    expect(parseUsername('')).toBeNull();
    expect(parseUsername('a'.repeat(39))).toBe('a'.repeat(39));
    expect(parseUsername('a'.repeat(40))).toBeNull();
  });

  test('formatUsername is the @ form used in text', () => {
    expect(formatUsername('alex')).toBe('@alex');
  });
});

describe('usernameFromEmail', () => {
  test('takes the local part, dropping a plus tag', () => {
    expect(usernameFromEmail('alex@nothingleft.dev')).toBe('alex');
    expect(usernameFromEmail('alex.lee+work@x.dev')).toBe('alex.lee');
  });

  test('drops characters a username cannot hold and trims punctuation at the ends', () => {
    expect(usernameFromEmail("o'brien.@x.dev")).toBe('obrien');
    expect(usernameFromEmail('!!!@x.dev')).toBe('user');
  });

  test('appends a number on a case-insensitive collision', () => {
    expect(usernameFromEmail('Alex@x.dev', new Set(['alex']))).toBe('Alex2');
    expect(usernameFromEmail('alex@x.dev', new Set(['alex', 'alex2', 'alex3']))).toBe('alex4');
  });

  test('the suffixed form still fits in 39 characters', () => {
    const long = `${'a'.repeat(45)}@x.dev`;
    const first = usernameFromEmail(long);
    expect(first.length).toBe(39);
    const second = usernameFromEmail(long, new Set([first]));
    expect(second).toBe(`${'a'.repeat(38)}2`);
    expect(parseUsername(second)).toBe(second);
  });
});
