import { errorKey, t, type ErrorCode } from '@nothingleft/i18n';
import type { QueryError } from '@nothingleft/query';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly params: Record<string, string | number> = {},
    readonly field?: string,
    readonly validValues?: string[],
    readonly span?: { start: number; end: number },
    readonly scope?: string,
  ) {
    super(t(errorKey(code), params));
    this.name = 'AppError';
  }

  static notFound(params: Record<string, string | number> = {}) {
    return new AppError('not_found', 404, params);
  }

  static unauthorized() {
    return new AppError('unauthorized', 401);
  }

  /** A search query the parser, the value check or saved-view expansion refused. */
  static fromQuery(err: QueryError, field = 'q') {
    return new AppError(err.code, 400, err.params, field, err.validValues, err.span);
  }

  static forbidden() {
    return new AppError('forbidden', 403);
  }

  /** A token whose owner may do this, but which was created without the scope for it. */
  static scopeMissing(scope: string) {
    return new AppError('token.scope_missing', 403, { scope }, undefined, undefined, undefined, scope);
  }
}
