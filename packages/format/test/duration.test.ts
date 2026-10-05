import { describe, expect, test } from 'bun:test';
import { DEFAULT_WORK_CALENDAR, formatDuration, parseDuration, type WorkCalendar } from '../src/index.ts';

const sixHourDay: WorkCalendar = { workdayMinutes: 360, workweekDays: 4 };

describe('parseDuration', () => {
  test('reads every unit against the default calendar', () => {
    expect(parseDuration('1w 1d 1h 1m')).toBe(2400 + 480 + 60 + 1);
  });

  test('accepts a single unit', () => {
    expect(parseDuration('90m')).toBe(90);
  });

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseDuration('  2H 30M  ')).toBe(150);
  });

  test('scales days and weeks by the calendar it is given', () => {
    expect(parseDuration('1w 1d', sixHourDay)).toBe(360 * 4 + 360);
  });

  test('rejects a repeated unit', () => {
    expect(parseDuration('1h 2h')).toBeNull();
  });

  test('rejects text that is not a duration', () => {
    expect(parseDuration('soon')).toBeNull();
    expect(parseDuration('1y')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  test('rejects a signed or fractional amount', () => {
    expect(parseDuration('-1h')).toBeNull();
    expect(parseDuration('1.5h')).toBeNull();
  });
});

describe('formatDuration', () => {
  test('renders largest unit first', () => {
    expect(formatDuration(2941)).toBe('1w 1d 1h 1m');
  });

  test('omits units that are zero', () => {
    expect(formatDuration(480)).toBe('1d');
  });

  test('renders zero and negatives as 0m', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-5)).toBe('0m');
  });

  test('uses the calendar it is given', () => {
    expect(formatDuration(360 * 4 + 360, sixHourDay)).toBe('1w 1d');
  });

  test('round-trips against parseDuration', () => {
    expect(parseDuration(formatDuration(1234))).toBe(1234);
  });
});

test('the default calendar is an eight-hour day and a five-day week', () => {
  expect(DEFAULT_WORK_CALENDAR).toEqual({ workdayMinutes: 480, workweekDays: 5 });
});
