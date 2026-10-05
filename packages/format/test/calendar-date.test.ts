import { describe, expect, test } from 'bun:test';
import { addCalendarDays, formatCalendarDate } from '../src/calendar-date.ts';

describe('formatCalendarDate', () => {
  test.each([
    ['2026-09-19', '19 Sep 2026'],
    ['2026-01-01', '1 Jan 2026'],
    ['2026-12-31', '31 Dec 2026'],
  ])('%s → %s', (input, expected) => expect(formatCalendarDate(input)).toBe(expected));
});

describe('addCalendarDays', () => {
  test('crosses months and years', () => {
    expect(addCalendarDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
