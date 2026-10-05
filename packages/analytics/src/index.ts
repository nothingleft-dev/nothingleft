import { PostHog } from 'posthog-node';
import { EventCatalogue, SAMPLED_EVENTS, type EventName, type EventProps } from '@nothingleft/types';
import { redactError } from './redact.ts';

export { redactError } from './redact.ts';

export interface AnalyticsConfig {
  key: string | undefined;
  host: string | undefined;
  analyticsEnabled: boolean;
  errorsEnabled: boolean;
  sampleRate: number;
}

export interface ExceptionContext {
  request_id?: string;
  route?: string;
  method?: string;
  status_code?: number;
  user_id?: number;
  org_id?: number;
}

export interface Actor {
  userId?: number;
  orgId?: number;
}

export interface Analytics {
  capture<N extends EventName>(name: N, props: EventProps<N>, actor?: Actor): void;
  captureException(error: unknown, ctx?: ExceptionContext): void;
  shutdown(): Promise<void>;
}

export type PostHogClient = Pick<PostHog, 'capture' | 'captureException' | 'shutdown'>;

// PostHog identities are prefixed so user and organisation numbers never collide — docs/analytics.md#privacy-rules.
export const distinctId = (userId: number | undefined) => (userId === undefined ? 'anonymous' : `user_${userId}`);
export const orgGroupId = (orgId: number) => `org_${orgId}`;

export const sampledOut = (name: EventName, sampleRate: number, roll = Math.random()) =>
  SAMPLED_EVENTS.has(name) && sampleRate < 1 && roll >= sampleRate;

const connectPostHog = (key: string, host: string | undefined): PostHogClient =>
  new PostHog(key, {
    ...(host ? { host } : {}),
    flushAt: 20,
    flushInterval: 10_000,
    enableExceptionAutocapture: false,
  });

export function createAnalytics(
  config: AnalyticsConfig,
  connect: (key: string, host: string | undefined) => PostHogClient = connectPostHog,
): Analytics {
  const wanted = config.analyticsEnabled || config.errorsEnabled;
  const client = wanted && config.key ? connect(config.key, config.host) : null;

  return {
    capture(name, props, actor) {
      if (!client || !config.analyticsEnabled) return;
      if (sampledOut(name, config.sampleRate)) return;
      const parsed = EventCatalogue[name].safeParse(props);
      if (!parsed.success) return;
      const groups = actor?.orgId ? { organization: orgGroupId(actor.orgId) } : undefined;
      client.capture({
        distinctId: distinctId(actor?.userId),
        event: name,
        properties: parsed.data,
        ...(groups ? { groups } : {}),
      });
    },

    captureException(error, ctx = {}) {
      if (!client || !config.errorsEnabled) return;
      const redacted = redactError(error);
      const err = redacted instanceof Error ? redacted : new Error(String(redacted));
      client.captureException(err, distinctId(ctx.user_id), {
        request_id: ctx.request_id,
        route: ctx.route,
        method: ctx.method,
        status_code: ctx.status_code,
        org_id: ctx.org_id === undefined ? undefined : orgGroupId(ctx.org_id),
      });
    },

    async shutdown() {
      await client?.shutdown();
    },
  };
}

export const noopAnalytics: Analytics = {
  capture() {},
  captureException() {},
  async shutdown() {},
};
