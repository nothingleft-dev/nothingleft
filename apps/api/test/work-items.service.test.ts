import { describe, expect, test } from 'bun:test';
import { AppError } from '@lib/errors';
import { workingDays } from '@services/work-items.service';

const monFri = { workweekDays: 5, weekStartsOn: 1 };

function refusal(fn: () => unknown): { code: string; field: string | undefined } | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AppError) return { code: err.code, field: err.field };
    throw err;
  }
}

describe('workingDays', () => {
  test('expands a range to its working days', () => {
    expect(workingDays('2026-09-18', '2026-09-22', monFri, 'f')).toEqual(['2026-09-18', '2026-09-21', '2026-09-22']);
  });

  test('refusals name the field they came from', () => {
    expect(refusal(() => workingDays('2026-09-22', '2026-09-21', monFri, 'records.2.from'))).toEqual({
      code: 'work_item.range_out_of_order',
      field: 'records.2.from',
    });
    expect(refusal(() => workingDays('2026-09-19', '2026-09-20', monFri, 'f'))?.code).toBe(
      'work_item.range_no_working_days',
    );
    expect(refusal(() => workingDays('2026-09-01', '2026-11-02', monFri, 'f'))?.code).toBe('work_item.range_too_long');
    expect(workingDays('2026-09-01', '2026-11-01', { workweekDays: 7, weekStartsOn: 1 }, 'f')).toHaveLength(62);
  });
});
