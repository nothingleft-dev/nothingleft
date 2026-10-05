import { z } from 'zod';

const EnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z
    .string()
    .regex(/^G-[A-Z0-9]+$/)
    .optional(),
  // Mirrors the API's BYO_ALLOW_ANY_ENDPOINT, which production refuses: the storage wizard then offers a typed endpoint.
  NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT: z.enum(['true', 'false']).optional(),
});

// Next inlines NEXT_PUBLIC_* only when each one is referenced by its full literal name.
const parsed = EnvSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined,
  NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT: process.env.NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT || undefined,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}

export const env = {
  apiBaseUrl: parsed.data.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, ''),
  gaMeasurementId: parsed.data.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? null,
  byoAllowAnyEndpoint: parsed.data.NEXT_PUBLIC_BYO_ALLOW_ANY_ENDPOINT === 'true',
};
