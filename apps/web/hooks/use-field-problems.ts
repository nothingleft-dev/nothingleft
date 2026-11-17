'use client';

import { useCallback, useState } from 'react';
import type { z } from 'zod';
import { formatCount } from '@lib/numbers';

type Issue = z.core.$ZodIssue;

function describe(issue: Issue, label: string) {
  if (issue.code === 'too_small' && issue.origin === 'string') {
    return Number(issue.minimum) <= 1
      ? `${label} is required.`
      : `${label} needs at least ${formatCount(Number(issue.minimum))} characters.`;
  }
  if (issue.code === 'too_big' && issue.origin === 'string') {
    return `${label} can be up to ${formatCount(Number(issue.maximum))} characters.`;
  }
  return `${label} is not valid.`;
}

/**
 * Checks a form against the schema the API validates with, before sending it, and says what
 * fails in the field's own words: "Name is required.", not the API's "The request is invalid.".
 * Only the fields in `labels` are checked; the rest are the API's to judge.
 */
export function fieldProblems(schema: z.ZodType, values: unknown, labels: Record<string, string>) {
  const result = schema.safeParse(values);
  const problems: Record<string, string> = {};
  if (result.success) return problems;
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    const label = labels[field];
    if (label && !problems[field]) problems[field] = describe(issue, label);
  }
  return problems;
}

/** `check` before submitting; `clear` a field as it is edited, so a stale message never contradicts it. */
export function useFieldProblems(schema: z.ZodType, labels: Record<string, string>) {
  const [problems, setProblems] = useState<Record<string, string>>({});

  const check = (values: unknown) => {
    const next = fieldProblems(schema, values, labels);
    setProblems(next);
    return Object.keys(next).length === 0;
  };

  const clear = useCallback((field: string) => {
    setProblems(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  return { problems, check, clear };
}
