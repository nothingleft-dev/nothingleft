import type { ErrorBody } from '@nothingleft/types';

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly field?: string,
    readonly validValues?: readonly string[],
    /** A search-query error: the characters of the query at fault. */
    readonly span?: { start: number; end: number },
  ) {
    super(message);
  }

  static fromBody(status: number, body: ErrorBody) {
    return new ApiError(status, body.code, body.message, body.request_id, body.field, body.valid_values, body.span);
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  // A 401 can also be a wrong password or code typed by someone already signed in; only
  // `unauthorized` means the session itself is gone.
  get isSignedOut() {
    return this.status === 401 && this.code === 'unauthorized';
  }
}

export class ApiNetworkError extends Error {
  override readonly name = 'ApiNetworkError';

  constructor(
    readonly kind: 'timeout' | 'offline' | 'malformed',
    readonly requestId: string | null = null,
  ) {
    super(
      kind === 'timeout'
        ? 'The server did not answer in time.'
        : kind === 'offline'
          ? 'The server could not be reached.'
          : 'The server answered with something that was not the API envelope.',
    );
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
