'use client';

import { useMemo } from 'react';
import { isApiError, UNKNOWN_FAILURE_MESSAGE } from '@lib/api/errors';

export interface FormError {
  /** Shown above the form when the failure is not tied to an input the form renders. */
  summary: string | null;
  /** Per-field messages, keyed by the `field` the API named. */
  fields: Record<string, string>;
  /** The refusal's code, so a form can offer the way out that fits it. */
  code: string | null;
  /** What the API would accept instead, such as a free project key. */
  validValues: readonly string[];
}

const EMPTY: FormError = { summary: null, fields: {}, code: null, validValues: [] };

/** `'any'`: the form lists every field's message itself, whatever the field. */
export type RenderedFields = readonly string[] | 'any';

/**
 * A refusal lands on the input the API named when the form renders it (`fields`), and in the
 * summary otherwise, so no refusal is ever silent — docs/api-conventions.md#error.
 */
export function splitApiError(error: unknown, fields: RenderedFields): FormError {
  if (!error) return EMPTY;
  if (isApiError(error)) {
    const validValues = error.validValues ?? [];
    return error.field && (fields === 'any' || fields.includes(error.field))
      ? { summary: null, fields: { [error.field]: error.message }, code: error.code, validValues }
      : { summary: error.message, fields: {}, code: error.code, validValues };
  }
  return {
    summary: error instanceof Error ? error.message : UNKNOWN_FAILURE_MESSAGE,
    fields: {},
    code: null,
    validValues: [],
  };
}

export function useApiError(error: unknown, fields: RenderedFields): FormError {
  const key = fields === 'any' ? fields : fields.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `fields`, which callers pass inline.
  return useMemo(() => splitApiError(error, fields), [error, key]);
}
