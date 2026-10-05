import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { ToolError } from '../src/errors.ts';
import { parseArguments } from '../src/validate.ts';

const schema = z.strictObject({
  project: z.string(),
  role: z.enum(['Observer', 'Project Admin']).optional(),
});

const failure = (raw: unknown) => {
  try {
    parseArguments('t', schema, raw);
  } catch (e) {
    return (e as ToolError).body;
  }
  throw new Error('expected a failure');
};

describe('parseArguments', () => {
  test('matches an enum value whatever its casing or separator', () => {
    expect(parseArguments('t', schema, { project: 'PP', role: 'project_admin' }).role).toBe('Project Admin');
    expect(parseArguments('t', schema, { project: 'PP', role: 'OBSERVER' }).role).toBe('Observer');
  });

  test('a bad enum value lists the valid ones', () => {
    expect(failure({ project: 'PP', role: 'Admin' })).toMatchObject({
      code: 'mcp.invalid_arguments',
      field: 'role',
      valid_values: ['Observer', 'Project Admin'],
    });
  });

  test('unknown and missing arguments are named', () => {
    expect(failure({ key: 'PP' }).hints).toEqual([
      'Missing required argument `project`.',
      'Unknown argument `key`. Valid arguments: `project`, `role`.',
    ]);
  });
});
