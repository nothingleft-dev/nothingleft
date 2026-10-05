import { z } from 'zod';

export const HealthSchema = z.object({ status: z.literal('ok') });
export type Health = z.infer<typeof HealthSchema>;

const DependencySchema = z.enum(['ok', 'fail']);

export const DeepHealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  // storage is not_configured, not fail, where no private bucket is set: that is a choice, not an outage.
  checks: z.object({
    db: DependencySchema,
    redis: DependencySchema,
    storage: z.enum(['ok', 'fail', 'not_configured']),
  }),
});
export type DeepHealth = z.infer<typeof DeepHealthSchema>;
