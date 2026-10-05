import { z } from 'zod';
import {
  BYO_CHECK_OBJECT_BYTES,
  BYO_CHECK_REASONS,
  BYO_CHECK_STEPS,
  BYO_MIGRATION_STATES,
  BYO_PROVIDERS,
  BYO_STATUSES,
  R2_JURISDICTIONS,
  STORAGE_FILES_PAGE_DEFAULT,
  STORAGE_FILES_PAGE_MAX,
  STORAGE_LEVELS,
  STORAGE_TARGETS,
} from './constants.ts';
import { MemberRefSchema } from './organizations.ts';
import { StepUpSchema } from './security.ts';

const Sha256Base64Schema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);

// S3's naming rules; R2's are a subset of them.
export const BucketNameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/);

export const ByoCheckErrorSchema = z.object({
  step: z.enum(BYO_CHECK_STEPS),
  reason: z.enum(BYO_CHECK_REASONS),
});
export type ByoCheckError = z.infer<typeof ByoCheckErrorSchema>;

export const ConnectStorageSchema = StepUpSchema.extend({
  provider: z.enum(BYO_PROVIDERS),
  // R2: the account the bucket lives in; the endpoint is built from it.
  account_id: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
  jurisdiction: z.enum(R2_JURISDICTIONS).optional(),
  // S3: the bucket's region; the endpoint is built from it.
  region: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-gov)?-[a-z]+-\d$/)
    .optional(),
  // Honoured only where the server allows any endpoint (never in production).
  endpoint: z.url().optional(),
  bucket: BucketNameSchema,
  access_key_id: z.string().trim().min(1).max(128),
  secret_access_key: z.string().min(1).max(256),
});
export type ConnectStorage = z.infer<typeof ConnectStorageSchema>;

export const StorageBrowserCheckInputSchema = z.object({
  size: z.literal(BYO_CHECK_OBJECT_BYTES),
  sha256: Sha256Base64Schema,
});
export type StorageBrowserCheckInput = z.infer<typeof StorageBrowserCheckInputSchema>;

export const StorageBrowserCheckSchema = z.object({
  check_id: z.uuid(),
  upload_url: z.url(),
  upload_headers: z.record(z.string(), z.string()),
  // A signed GET the browser fetches, so a missing CORS rule for GET shows up here too.
  download_url: z.url(),
  expires_in: z.number().int().positive(),
});
export type StorageBrowserCheck = z.infer<typeof StorageBrowserCheckSchema>;

export const VerifyStorageSchema = z.object({
  check_id: z.uuid(),
  sha256: Sha256Base64Schema,
});
export type VerifyStorage = z.infer<typeof VerifyStorageSchema>;

export const DisconnectStorageSchema = StepUpSchema;
export type DisconnectStorage = z.infer<typeof DisconnectStorageSchema>;

export const StorageMigrationSchema = z.object({
  state: z.enum(BYO_MIGRATION_STATES),
  migrated_bytes: z.number().int().nonnegative(),
  total_bytes: z.number().int().nonnegative(),
  migrated_files: z.number().int().nonnegative(),
  total_files: z.number().int().nonnegative(),
  error: ByoCheckErrorSchema.nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  // Running, but nothing has moved for BYO_MIGRATION_STALL_MINUTES: offer a retry.
  stalled: z.boolean(),
});
export type StorageMigration = z.infer<typeof StorageMigrationSchema>;

export const StorageConnectionSchema = z.object({
  provider: z.enum(BYO_PROVIDERS),
  endpoint: z.string(),
  region: z.string(),
  bucket: z.string(),
  access_key_id: z.string(),
  // Always BYO_SECRET_MASK: the secret is never returned.
  secret: z.string(),
  status: z.enum(BYO_STATUSES),
  verified_at: z.string().nullable(),
  checked_at: z.string().nullable(),
  last_error: ByoCheckErrorSchema.nullable(),
  migration: StorageMigrationSchema,
  created_by: MemberRefSchema,
  updated_by: MemberRefSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type StorageConnection = z.infer<typeof StorageConnectionSchema>;

const Tally = z.object({ files: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() });

export const StorageOverviewSchema = z.object({
  // The private platform bucket: what counts against the plan's quota.
  platform: Tally.extend({
    limit_bytes: z.number().int().positive(),
    level: z.enum(STORAGE_LEVELS),
  }),
  // The customer's own bucket: shown, never counted.
  bring_your_own: Tally,
  // Completed uploads no form claimed yet; they go after two days, and only their uploader sees them.
  unclaimed: Tally,
  // Files of deleted issues and articles, freed when their restore window closes.
  awaiting_purge: Tally,
  // Files in a bucket the organisation connected before: they serve again if it is reconnected.
  earlier_buckets: z.array(Tally.extend({ bucket: z.string() })),
  connection: StorageConnectionSchema.nullable(),
  // The origin the customer's CORS rule must allow; see byoCorsRules.
  cors_origin: z.string(),
});
export type StorageOverview = z.infer<typeof StorageOverviewSchema>;

export const StorageFileSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  url: z.url(),
  storage_target: z.enum(STORAGE_TARGETS),
  // false when the file sits in a customer bucket that is disconnected or failing.
  available: z.boolean(),
  project: z.string(),
  issue: z.string().nullable(),
  article: z.object({ slug: z.string(), title: z.string() }).nullable(),
  comment_id: z.number().int().nullable(),
  work_item_id: z.number().int().nullable(),
  // Set while the issue or article is deleted but restorable; the file goes with it.
  purges_at: z.string().nullable(),
  created_by: MemberRefSchema,
  created_at: z.string(),
  me: z.object({ can_delete: z.boolean() }),
});
export type StorageFile = z.infer<typeof StorageFileSchema>;

export const StorageFilesQuerySchema = z.object({
  sort: z.enum(['size', 'created']).default('size'),
  target: z.enum(STORAGE_TARGETS).optional(),
  project: z.string().trim().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(STORAGE_FILES_PAGE_MAX).default(STORAGE_FILES_PAGE_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
});
export type StorageFilesQuery = z.infer<typeof StorageFilesQuerySchema>;

/** The IAM policy an S3 key needs, and nothing more: objects in one bucket, plus listing it so a missing object reads as 404. */
export function byoAccessPolicy(bucket: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        Resource: `arn:aws:s3:::${bucket}/*`,
      },
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}` },
    ],
  };
}

/** Browsers upload and read straight from the bucket, so it must let the app's origin do both. */
export function byoCorsRules(origin: string) {
  return [
    {
      AllowedOrigins: [origin],
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['content-type', 'x-amz-checksum-sha256'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ];
}
