'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { z } from 'zod';
import { isApiError } from '@lib/api/errors';

type Errors<T> = Partial<Record<keyof T & string, string>>;

interface AuthFormOptions<S extends z.ZodType, R> {
  schema: S;
  initial: z.input<S>;
  /** One message per field, so the copy is ours rather than Zod's. */
  messages: Partial<Record<keyof z.input<S> & string, string>>;
  submit: (values: z.output<S>) => Promise<R>;
  onSuccess?: (result: R) => void;
}

/**
 * Validation runs against the same Zod schema the API validates with
 * (`packages/types`), so the browser and the server cannot disagree about what a valid
 * request is. Nothing here uses the browser's own validation UI - every form carries
 * `noValidate` and the messages below are rendered by us (CLAUDE.md rule 10).
 */
export function useAuthForm<S extends z.ZodType, R>({
  schema,
  initial,
  messages,
  submit,
  onSuccess,
}: AuthFormOptions<S, R>) {
  type Values = z.input<S>;
  const [values, setValues] = useState<Values>(initial);
  const [submittedValues, setSubmittedValues] = useState<Values | null>(null);
  const [localErrors, setLocalErrors] = useState<Errors<Values>>({});

  const mutation = useMutation({
    mutationFn: (parsed: z.output<S>) => submit(parsed),
    ...(onSuccess ? { onSuccess } : {}),
  });

  const set = useCallback(<K extends keyof Values & string>(key: K, value: Values[K]) => {
    setValues(current => ({ ...(current as object), [key]: value }) as Values);
    // Clearing on edit keeps a stale message from contradicting what is on screen.
    setLocalErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const { serverSummary, serverFields } = useMemo(() => {
    const error = mutation.error;
    if (!error) return { serverSummary: null, serverFields: {} as Errors<Values> };
    if (isApiError(error)) {
      if (error.field) {
        const field = error.field as keyof Values & string;
        return {
          serverSummary: null,
          serverFields:
            submittedValues && values[field] === submittedValues[field]
              ? ({ [field]: error.message } as Errors<Values>)
              : ({} as Errors<Values>),
        };
      }
      return { serverSummary: error.message, serverFields: {} as Errors<Values> };
    }
    return {
      serverSummary: error instanceof Error ? error.message : 'Something went wrong. Try again.',
      serverFields: {} as Errors<Values>,
    };
  }, [mutation.error, submittedValues, values]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Errors<Values> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as keyof Values & string;
        if (field && !next[field]) next[field] = messages[field] ?? issue.message;
      }
      setLocalErrors(next);
      return;
    }
    setLocalErrors({});
    setSubmittedValues(values);
    mutation.mutate(parsed.data as z.output<S>);
  };

  return {
    values,
    set,
    onSubmit,
    errors: { ...serverFields, ...localErrors } as Errors<Values>,
    summary: Object.keys(localErrors).length > 0 ? null : serverSummary,
    error: mutation.error,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    reset: () => {
      setValues(initial);
      setLocalErrors({});
      setSubmittedValues(null);
      mutation.reset();
    },
  };
}
