import { z } from 'zod';
import { EXPORT_STATUSES } from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

export const ExportJobSchema = z.object({
  id: z.number().int(),
  scope: z.literal('org'),
  format: z.literal('json'),
  status: z.enum(EXPORT_STATUSES),
  size_bytes: z.number().int().nullable(),
  file_count: z.number().int().nullable(),
  // Files the archive could not include: their objects were gone or their bucket unreachable.
  missing_file_count: z.number().int().nullable(),
  // The API path that redirects to the archive while it is completed and unexpired.
  download_url: z.string().nullable(),
  expires_at: z.iso.datetime().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  created_by: MemberRefSchema,
  created_at: z.iso.datetime(),
  started_at: z.iso.datetime().nullable(),
  completed_at: z.iso.datetime().nullable(),
});
export type ExportJob = z.infer<typeof ExportJobSchema>;
