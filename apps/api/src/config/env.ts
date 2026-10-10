import { z } from 'zod';
import { ASSET_BASE_URL, ZOHO_EMAIL_ENDPOINT } from './constants';

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform(s =>
      s
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));

const bool = z.enum(['true', 'false']).transform(v => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_TARGETS: csv(['pretty', 'json', 'file'] as const).default(['pretty', 'file']),
  LOG_FILE: z.string().default('logs/api.log'),

  DATABASE_URL: z.string().url().startsWith('postgres'),
  DATABASE_URL_POOLED: z.string().url().startsWith('postgres'),
  REDIS_URL: z
    .string()
    .url()
    .regex(/^rediss?:\/\//)
    .refine(
      u => {
        if (!URL.canParse(u)) return false;
        const { protocol, hostname } = new URL(u);
        return protocol === 'rediss:' || ['localhost', '127.0.0.1', '[::1]', 'redis'].includes(hostname);
      },
      {
        message: 'hosted Redis (Upstash) requires TLS - use rediss://',
      },
    ),

  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  // Where /mcp's tools reach the REST API. Unset means this process over loopback; a split-out MCP service points it at the public URL.
  MCP_API_BASE_URL: z.string().url().optional(),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .trim()
    .regex(/^(?:|false|\d+|[\da-fA-F.:/]+(?:\s*,\s*[\da-fA-F.:/]+)*)$/, {
      message: 'false, a hop count, or comma-separated proxy IPs / CIDRs',
    })
    .optional(),

  // Object storage. Absent locally until MinIO or R2 is configured; the avatar routes
  // answer storage.not_configured rather than failing at boot.
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BUCKET: z.string().optional(),
  S3_PUBLIC_BUCKET_BASE_URL: z.string().url().optional(),
  // Attachments. Without the bucket, uploads answer storage.not_configured. The file route mounts at
  // FILES_BASE_URL's path; unset, that is API_BASE_URL/files.
  S3_PRIVATE_BUCKET: z.string().optional(),
  FILES_BASE_URL: z.string().url().optional(),
  // Lets a bring-your-own connection name any endpoint, so tests can use a local S3-compatible
  // store. Production refuses it: the server would make requests to any address an admin typed.
  BYO_ALLOW_ANY_ENDPOINT: bool.default(false),

  // Unset, that provider's start endpoint answers auth.oauth_not_configured.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['resend', 'zoho', 'smtp']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  ZOHO_EMAIL_API_KEY: z.string().optional(),
  ZOHO_EMAIL_ENDPOINT: z.string().url().default(ZOHO_EMAIL_ENDPOINT),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  // Unset: implicit TLS on port 465, STARTTLS otherwise.
  SMTP_SECURE: bool.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // Public static host for assets the API links to, such as the logo images in email.
  ASSET_BASE_URL: z.string().url().default(ASSET_BASE_URL),
  EMAIL_FROM: z.string().default('Nothing Left <noreply@notifications.nothingleft.dev>'),
  // Signs unsubscribe links. Required in production; changing it breaks every link already sent.
  EMAIL_LINK_SECRET: z.string().min(32).optional(),
  // 32 bytes, base64. Seals two-factor and BYO storage secrets. Required in
  // production; changing it makes every sealed secret unreadable.
  ENCRYPTION_MASTER_KEY: z
    .string()
    .refine(v => Buffer.from(v, 'base64').length === 32, { message: 'must be 32 bytes, base64' })
    .optional(),

  FREE_SEAT_LIMIT: z.coerce.number().int().positive().optional(),
  FREE_STORAGE_BYTES: z.coerce.number().int().positive().optional(),

  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default('https://us.i.posthog.com'),
  POSTHOG_ANALYTICS_ENABLED: bool.default(false),
  POSTHOG_ERRORS_ENABLED: bool.default(false),
  POSTHOG_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
});

const CheckedEnvSchema = EnvSchema.refine(e => e.NODE_ENV !== 'production' || e.EMAIL_LINK_SECRET !== undefined, {
  path: ['EMAIL_LINK_SECRET'],
  message: 'required in production: it signs unsubscribe links',
})
  .refine(e => e.NODE_ENV !== 'production' || e.ENCRYPTION_MASTER_KEY !== undefined, {
    path: ['ENCRYPTION_MASTER_KEY'],
    message: 'required in production: it seals two-factor and storage secrets',
  })
  .refine(e => e.NODE_ENV !== 'production' || e.EMAIL_PROVIDER !== 'resend' || e.RESEND_API_KEY !== undefined, {
    path: ['RESEND_API_KEY'],
    message: 'required in production: without it, mail would be logged instead of sent',
  })
  .refine(e => e.NODE_ENV !== 'production' || e.EMAIL_PROVIDER !== 'zoho' || e.ZOHO_EMAIL_API_KEY !== undefined, {
    path: ['ZOHO_EMAIL_API_KEY'],
    message: 'required in production: without it, mail would be logged instead of sent',
  })
  .refine(e => e.NODE_ENV !== 'production' || e.EMAIL_PROVIDER !== 'smtp' || e.SMTP_HOST !== undefined, {
    path: ['SMTP_HOST'],
    message: 'required in production: without it, mail would be logged instead of sent',
  })
  .refine(e => (e.SMTP_USER === undefined) === (e.SMTP_PASSWORD === undefined), {
    path: ['SMTP_PASSWORD'],
    message: 'SMTP_USER and SMTP_PASSWORD are set together or not at all',
  })
  .refine(e => e.NODE_ENV !== 'production' || !e.BYO_ALLOW_ANY_ENDPOINT, {
    path: ['BYO_ALLOW_ANY_ENDPOINT'],
    message: 'never in production: storage endpoints are built from an account id or a region there',
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = CheckedEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const filesBaseUrl = (env: Env): string => env.FILES_BASE_URL ?? `${env.API_BASE_URL.replace(/\/$/, '')}/files`;

export type TrustProxy = false | number | string;

export function parseTrustProxy(raw: string | undefined, nodeEnv: Env['NODE_ENV']): TrustProxy {
  if (raw === undefined || raw === '') return nodeEnv === 'production' ? 1 : false;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw) === 0 ? false : Number(raw);
  return raw;
}

// Fastify 5 treats a numeric trustProxy as trusting nothing, so a hop count becomes the equivalent function.
export const fastifyTrustProxy = (trust: TrustProxy): false | string | ((address: string, hop: number) => boolean) =>
  typeof trust === 'number' ? (_address, hop) => hop < trust : trust;

// Development and tests only; production refuses to boot without its own.
const DEV_EMAIL_LINK_SECRET = 'development-only-email-link-secret-000';

export const emailLinkSecret = (env: Env): string => env.EMAIL_LINK_SECRET ?? DEV_EMAIL_LINK_SECRET;

const DEV_ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 'development-only').toString('base64');

export const encryptionMasterKey = (env: Env): Buffer =>
  Buffer.from(env.ENCRYPTION_MASTER_KEY ?? DEV_ENCRYPTION_MASTER_KEY, 'base64');
