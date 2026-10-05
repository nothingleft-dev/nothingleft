import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import { ToolError, type ToolErrorBody } from './errors.ts';
import { code, list } from './render.ts';

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();

function enumOf(schema: z.ZodType): readonly string[] | null {
  let inner: z.ZodType = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) inner = inner.unwrap() as z.ZodType;
  return inner instanceof z.ZodEnum ? (inner.options as string[]) : null;
}

/** `project admin`, `project_admin` and `Project Admin` are one role: agents guess the casing. */
function foldEnums(shape: z.ZodRawShape, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  for (const [key, schema] of Object.entries(shape)) {
    const options = enumOf(schema as z.ZodType);
    const value = out[key];
    if (!options || typeof value !== 'string') continue;
    out[key] = options.find(o => fold(o) === fold(value)) ?? value;
  }
  return out;
}

const pathOf = (issue: z.core.$ZodIssue) => issue.path.map(String).join('.');

/** Zod issues → one instructive error: unknown and missing arguments named, enum values listed. */
export function parseArguments<S extends z.ZodObject>(tool: string, schema: S, raw: unknown): z.output<S> {
  const args = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result = schema.safeParse(foldEnums(schema.shape, args));
  if (result.success) return result.data;

  const body: Omit<ToolErrorBody, 'code' | 'message'> = { hints: [] };
  const valid = Object.keys(schema.shape);
  for (const issue of result.error.issues) {
    const at = pathOf(issue);
    if (issue.code === 'unrecognized_keys') {
      body.hints!.push(t('mcp.hint.unknown_arguments', { names: list(issue.keys), valid: list(valid) }));
    } else if (issue.code === 'invalid_type' && issue.path.length === 1 && args[at] === undefined) {
      body.hints!.push(t('mcp.hint.required', { name: code(at) }));
    } else if (issue.code === 'invalid_value' && !body.valid_values) {
      body.field = at;
      body.valid_values = issue.values.map(String);
    } else {
      body.hints!.push(`${code(at)}: ${issue.message}`);
    }
  }
  throw ToolError.local('mcp.invalid_arguments', { tool }, body);
}
