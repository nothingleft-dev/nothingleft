import { t, type ErrorCode } from '@nothingleft/i18n';

export interface ToolErrorBody {
  code: string;
  message: string;
  field?: string;
  valid_values?: string[];
  request_id?: string;
  hints?: string[];
}

/** Anything a tool can fail with, whether the API said it or the MCP layer did. */
export class ToolError extends Error {
  constructor(readonly body: ToolErrorBody) {
    super(body.message);
  }

  static local(
    code: ErrorCode,
    params: Record<string, string | number> = {},
    extra: Omit<ToolErrorBody, 'code' | 'message'> = {},
  ): ToolError {
    return new ToolError({ code, message: t(`error.${code}`, params), ...extra });
  }
}
