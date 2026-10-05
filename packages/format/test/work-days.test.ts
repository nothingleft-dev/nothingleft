import { describe, expect, test } from 'bun:test';
import { calendarDaysBetween, workingDaysBetween } from '../src/work-days.ts';

const monFri = { workweekDays: 5, weekStartsOn: 1 };

describe('workingDaysBetween', () => {
  test('a Monday-start five-day week skips Saturday and Sunday', () => {
    expect(workingDaysBetween('2026-09-18', '2026-09-22', monFri)).toEqual(['2026-09-18', '2026-09-21', '2026-09-22']);
  });

  test('a Sunday-start five-day week works Sunday to Thursday', () => {
    expect(workingDaysBetween('2026-09-18', '2026-09-22', { workweekDays: 5, weekStartsOn: 0 })).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
    ]);
  });

  test('a seven-day week keeps every day, across a month boundary', () => {
    expect(workingDaysBetween('2026-09-29', '2026-10-02', { workweekDays: 7, weekStartsOn: 1 })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  test('a weekend alone or a backwards range has none', () => {
    expect(workingDaysBetween('2026-09-19', '2026-09-20', monFri)).toEqual([]);
    expect(workingDaysBetween('2026-09-22', '2026-09-18', monFri)).toEqual([]);
  });
});

describe('calendarDaysBetween', () => {
  test('counts both ends, and nothing for a backwards range', () => {
    expect(calendarDaysBetween('2026-09-01', '2026-11-01')).toBe(62);
    expect(calendarDaysBetween('2026-09-21', '2026-09-21')).toBe(1);
    expect(calendarDaysBetween('2026-09-22', '2026-09-21')).toBe(0);
  });
});
