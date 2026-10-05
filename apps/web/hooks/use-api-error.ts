'use client';

import { useMemo } from 'react';
import { isApiError } from '@lib/api/errors';

export interface FormError {
  /** Shown above the form when the failure is not tied to one input. */
  summary: string | null;
  /** Per-field messages, keyed by the `field` the API named. */
  fields: Record<string, string>;
}

const EMPTY: FormError = { summary: null, fields: {} };

/**
 * The API names the offending input in `error.field`, so a failure lands on that input
 * rather than in a generic banner — docs/api-conventions.md#error.
 */
export function useApiError(error: unknown): FormError {
  return useMemo(() => {
    if (!error) return EMPTY;
    if (isApiError(error)) {
      return error.field
        ? { summary: null, fields: { [error.field]: error.message } }
        : { summary: error.message, fields: {} };
    }
    return { summary: error instanceof Error ? error.message : 'Something went wrong. Try again.', fields: {} };
  }, [error]);
}
