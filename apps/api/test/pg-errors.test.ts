import { describe, expect, test } from 'bun:test';
import { AppError } from '@lib/errors';
import { constraintName, isUniqueViolation, withUniqueAs } from '@lib/pg-errors';

const pgError = (code: string, constraint?: string) => Object.assign(new Error('pg'), { code, constraint });
const wrapped = (cause: unknown) => Object.assign(new Error('Failed query'), { cause });
const KEY = 'workflow_statuses_project_lower_name_unique';
const taken = () => new AppError('config.name_taken', 409, { name: 'Review' }, 'name');

describe('pg-errors', () => {
  test('finds the PostgreSQL error under a Drizzle wrapper', () => {
    const err = wrapped(pgError('23505', KEY));
    expect(isUniqueViolation(err)).toBe(true);
    expect(constraintName(err)).toBe(KEY);
    expect(isUniqueViolation(wrapped(pgError('23514', 'issues_story_points_check')))).toBe(false);
    expect(isUniqueViolation(new AppError('forbidden', 403))).toBe(false);
    expect(constraintName(new Error('plain'))).toBeUndefined();
  });

  test('a unique violation on a named key becomes the friendly error; any other is rethrown', async () => {
    const mapped = await withUniqueAs(() => Promise.reject(wrapped(pgError('23505', KEY))), [KEY], taken).catch(
      (e: unknown) => e,
    );
    expect(mapped).toBeInstanceOf(AppError);
    expect((mapped as AppError).code).toBe('config.name_taken');

    const other = wrapped(pgError('23505', 'issues_project_key_number_unique'));
    expect(await withUniqueAs(() => Promise.reject(other), [KEY], taken).catch((e: unknown) => e)).toBe(other);
    expect(await withUniqueAs(async () => 7, [KEY], taken)).toBe(7);
  });
});
