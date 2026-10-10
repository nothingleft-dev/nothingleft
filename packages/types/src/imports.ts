import { z } from 'zod';
import { ATTACHMENT_FILENAME_MAX_LENGTH, CUSTOM_FIELD_SLUG_MAX, IMPORT_FIELDS, IMPORT_STATUSES } from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

const Sha256Base64Schema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);

export const IMPORT_TARGET_PATTERN = new RegExp(
  `^(${IMPORT_FIELDS.join('|')}|custom:[a-z][a-z0-9-]{0,${CUSTOM_FIELD_SLUG_MAX - 1}})$`,
);

// Issue field (or `custom:<slug>`) → the CSV header whose column fills it. A header left out is ignored.
export const ImportMappingSchema = z
  .record(z.string().trim().regex(IMPORT_TARGET_PATTERN), z.string().max(500))
  .refine(m => Object.keys(m).length > 0);
export type ImportMapping = z.infer<typeof ImportMappingSchema>;

export const CreateImportSchema = z.object({
  filename: z.string().trim().min(1).max(ATTACHMENT_FILENAME_MAX_LENGTH),
  // Checked by the service against CSV_IMPORT_MAX_BYTES, so an oversized file gets the catalogue error.
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: Sha256Base64Schema,
});
export type CreateImport = z.infer<typeof CreateImportSchema>;

// `row` is the line a spreadsheet shows: the header is row 1, the first issue row 2.
export const ImportRowErrorSchema = z.object({
  row: z.number().int().positive(),
  column: z.string().nullable(),
  field: z.string().nullable(),
  code: z.string(),
  message: z.string(),
  valid_values: z.array(z.string()).optional(),
});
export type ImportRowError = z.infer<typeof ImportRowErrorSchema>;

export const ImportJobSchema = z.object({
  id: z.number().int(),
  project: z.string(),
  source: z.literal('csv'),
  filename: z.string(),
  size_bytes: z.number().int(),
  status: z.enum(IMPORT_STATUSES),
  headers: z.array(z.string()).nullable(),
  column_mapping: z.record(z.string(), z.string()).nullable(),
  total_rows: z.number().int().nullable(),
  processed_rows: z.number().int(),
  created_issues: z.number().int(),
  failed_rows: z.number().int(),
  // At most CSV_IMPORT_ERRORS_KEPT; failed_rows still counts every one.
  errors: z.array(ImportRowErrorSchema),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  created_by: MemberRefSchema,
  created_at: z.iso.datetime(),
  started_at: z.iso.datetime().nullable(),
  completed_at: z.iso.datetime().nullable(),
});
export type ImportJob = z.infer<typeof ImportJobSchema>;

export const ImportUploadSchema = z.object({
  job: ImportJobSchema,
  upload_url: z.url(),
  // Every one must be sent on the PUT; the signature covers them.
  upload_headers: z.record(z.string(), z.string()),
  expires_in: z.number().int().positive(),
});
export type ImportUpload = z.infer<typeof ImportUploadSchema>;

export const ImportPreviewSchema = z.object({
  job: ImportJobSchema,
  // The first rows under the headers, as written in the file.
  sample: z.array(z.array(z.string())),
  // Each header whose name matches an issue field or custom field, matched without case or spacing.
  suggested_mapping: z.record(z.string(), z.string()),
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const RunImportSchema = z.object({ column_mapping: ImportMappingSchema });
export type RunImport = z.infer<typeof RunImportSchema>;

export const ImportUnknownValueSchema = z.object({
  field: z.string(),
  value: z.string(),
  rows: z.number().int().positive(),
});

export const ImportDryRunSchema = z.object({
  total_rows: z.number().int(),
  valid_rows: z.number().int(),
  failed_rows: z.number().int(),
  errors: z.array(ImportRowErrorSchema),
  // Status, priority, type, sprint and assignee values no row could use, most frequent first.
  unknown_values: z.array(ImportUnknownValueSchema),
});
export type ImportDryRun = z.infer<typeof ImportDryRunSchema>;
