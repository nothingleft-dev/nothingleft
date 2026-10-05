import { describe, expect, test } from 'bun:test';
import { type DateValue, resolveDatePeriod } from '../src/index.ts';

// Thursday 24 Sep 2026, week starting Monday.
const context = { today: '2026-09-24', weekStartsOn: 1 as const };
const keyword = (k: string): DateValue => ({ kind: 'keyword', keyword: k }) as DateValue;

describe('resolveDatePeriod', () => {
  test.each([
    ['today', '2026-09-24', '2026-09-24'],
    ['yesterday', '2026-09-23', '2026-09-23'],
    ['tomorrow', '2026-09-25', '2026-09-25'],
    ['this week', '2026-09-21', '2026-09-27'],
    ['last week', '2026-09-14', '2026-09-20'],
    ['next week', '2026-09-28', '2026-10-04'],
    ['this month', '2026-09-01', '2026-09-30'],
    ['last month', '2026-08-01', '2026-08-31'],
    ['next month', '2026-10-01', '2026-10-31'],
    ['this year', '2026-01-01', '2026-12-31'],
    ['last year', '2025-01-01', '2025-12-31'],
    ['next year', '2027-01-01', '2027-12-31'],
  ])('%s', (k, start, end) => {
    expect(resolveDatePeriod(keyword(k), context)).toEqual({ start, end });
  });

  test('now is an instant, not a period', () => {
    expect(resolveDatePeriod(keyword('now'), context)).toBeNull();
  });

  test('weekdays resolve within the current week', () => {
    expect(resolveDatePeriod({ kind: 'weekday', weekday: 1 }, context)).toEqual({
      start: '2026-09-21',
      end: '2026-09-21',
    });
    expect(resolveDatePeriod({ kind: 'weekday', weekday: 7 }, context)).toEqual({
      start: '2026-09-27',
      end: '2026-09-27',
    });
  });

  test('week start moves with the organisation setting', () => {
    const sunday = { today: '2026-09-24', weekStartsOn: 7 as const };
    expect(resolveDatePeriod(keyword('this week'), sunday)).toEqual({ start: '2026-09-20', end: '2026-09-26' });
    expect(resolveDatePeriod({ kind: 'weekday', weekday: 7 }, sunday)).toEqual({
      start: '2026-09-20',
      end: '2026-09-20',
    });
  });

  test('a month value spans the whole month', () => {
    expect(resolveDatePeriod({ kind: 'month', month: '2026-02' }, context)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(resolveDatePeriod({ kind: 'month', month: '2028-02' }, context)).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });

  test('relative offsets are single days for d, w, M and y', () => {
    expect(resolveDatePeriod({ kind: 'relative', sign: -1, amount: 7, unit: 'd' }, context)).toEqual({
      start: '2026-09-17',
      end: '2026-09-17',
    });
    expect(resolveDatePeriod({ kind: 'relative', sign: 1, amount: 2, unit: 'w' }, context)).toEqual({
      start: '2026-10-08',
      end: '2026-10-08',
    });
    expect(resolveDatePeriod({ kind: 'relative', sign: -1, amount: 1, unit: 'M' }, context)).toEqual({
      start: '2026-08-24',
      end: '2026-08-24',
    });
    expect(resolveDatePeriod({ kind: 'relative', sign: 1, amount: 1, unit: 'y' }, context)).toEqual({
      start: '2027-09-24',
      end: '2027-09-24',
    });
  });

  test('month arithmetic clamps to the last day', () => {
    expect(resolveDatePeriod({ kind: 'relative', sign: 1, amount: 1, unit: 'M' }, { today: '2026-01-31' })).toEqual({
      start: '2026-02-28',
      end: '2026-02-28',
    });
  });

  test('minute and hour offsets are instants', () => {
    expect(resolveDatePeriod({ kind: 'relative', sign: -1, amount: 24, unit: 'h' }, context)).toBeNull();
    expect(resolveDatePeriod({ kind: 'relative', sign: -1, amount: 30, unit: 'm' }, context)).toBeNull();
  });

  test('a literal date is itself', () => {
    expect(resolveDatePeriod({ kind: 'date', date: '2026-09-19' }, context)).toEqual({
      start: '2026-09-19',
      end: '2026-09-19',
    });
  });
});
