import type {
  ByoCheckError,
  ByoCheckReason,
  ByoCheckStep,
  ByoProvider,
  ByoStatus,
  StorageTarget,
} from '@nothingleft/types';
import type {
  OrganizationsRepository,
  OrgStorageConfigRow,
  OrgStorageConfigsRepository,
  StorageConnectionRow,
  TenantContext,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { unseal } from '@lib/crypto';
import type { Mailer } from '@lib/email';
import { classifyStorageError, type ObjectAddress, type PrivateStore, type Storage } from '@lib/storage';

export interface ObjectStoresDeps {
  storage: Storage;
  configs: OrgStorageConfigsRepository;
  organizations: OrganizationsRepository;
  masterKey: Buffer;
  /** Already wrapped in bestEffort. */
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
  now?: () => Date;
}

export type StorageEmail = 'storage_connected' | 'storage_disconnected' | 'storage_byo_failed';

// A refusal from the bucket itself: retrying will not help until someone fixes the credentials.
const TRIPS_THE_CONNECTION = new Set<ByoCheckReason>([
  'invalid_key',
  'wrong_secret',
  'no_bucket',
  'access_denied',
  'wrong_region',
]);

export const sealedSecretAad = (orgId: number) => `org_storage_configs:${orgId}`;

export const encodeCheckError = (error: ByoCheckError) => `${error.step}.${error.reason}`;

export function decodeCheckError(value: string | null): ByoCheckError | null {
  if (!value) return null;
  const [step, reason] = value.split('.') as [ByoCheckStep, ByoCheckReason];
  return { step, reason };
}

/** AWS answers virtual-hosted requests; R2 and every other S3-compatible store take the bucket in the path. */
export const pathStyleFor = (provider: ByoProvider, endpoint: string) =>
  provider !== 's3' || !new URL(endpoint).hostname.endsWith('.amazonaws.com');

// 409, not 5xx: a customer's revoked key is their state to fix, not our outage to report on every image load.
/**
 * The state members see on the Organization. A connection that failed before it ever verified
 * holds no files and blocks nothing, so it reads as `pending` — setup still under way.
 */
export function bringYourOwnState(
  row: Pick<OrgStorageConfigRow, 'status' | 'verified_at'> | undefined,
): ByoStatus | null {
  if (!row) return null;
  if (row.status === 'failed' && row.verified_at === null) return 'pending';
  return row.status as ByoStatus;
}

export const byoUnavailable = () => new AppError('storage.byo_unavailable', 409);

export const isByoUnavailable = (error: unknown) =>
  error instanceof AppError && error.code === 'storage.byo_unavailable';

/**
 * Which bucket an object lives in, and the client that reaches it. A customer's client is built
 * once per set of credentials: the cache key holds the sealed secret, whose fresh IV changes on
 * every connect or rotation, so a stale client is never used on any instance.
 */
export function objectStores(deps: ObjectStoresDeps) {
  const { storage, configs, organizations, masterKey, mailer, analytics } = deps;
  const now = deps.now ?? (() => new Date());
  const clients = new Map<number, { stamp: string; store: PrivateStore }>();

  function platform(): PrivateStore {
    if (!storage.private) throw new AppError('storage.not_configured', 503);
    return storage.private;
  }

  function customer(row: StorageConnectionRow): PrivateStore {
    const stamp = [row.endpoint, row.region, row.bucket, row.access_key_id, row.secret_ciphertext].join('|');
    const cached = clients.get(row.org_id);
    if (cached?.stamp === stamp) return cached.store;
    const store = storage.connect({
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket,
      accessKeyId: row.access_key_id,
      secretAccessKey: unseal(masterKey, 'byo_storage', sealedSecretAad(row.org_id), row.secret_ciphertext),
      pathStyle: pathStyleFor(row.provider as ByoProvider, row.endpoint),
    });
    clients.set(row.org_id, { stamp, store });
    return store;
  }

  async function notifyAdmins(ctx: TenantContext, key: StorageEmail, params: Record<string, string>) {
    const org = await organizations.findById(ctx);
    if (!org) return;
    for (const admin of await organizations.listAdmins(ctx)) {
      await mailer.send({
        to: admin.user.email,
        subject: `email.${key}.subject`,
        body: `email.${key}.body`,
        params: { name: admin.user.name, org: org.name, url: `${deps.appBaseUrl}/organization?tab=storage`, ...params },
      });
    }
  }

  /** The circuit breaker: the first refusal marks the connection failed, and only that call tells anyone. */
  async function trip(ctx: TenantContext, row: StorageConnectionRow, error: ByoCheckError) {
    const flipped = await configs.markFailed(ctx, encodeCheckError(error), now());
    if (!flipped) return;
    analytics.capture('byo_storage_failed', { provider: row.provider as ByoProvider, ...error }, { orgId: ctx.orgId });
    await notifyAdmins(ctx, 'storage_byo_failed', { bucket: row.bucket });
  }

  /** Runs one call against a customer's bucket; a refusal trips the connection and answers byo_unavailable. */
  async function guard<T>(ctx: TenantContext, row: StorageConnectionRow, step: ByoCheckStep, call: () => Promise<T>) {
    try {
      return await call();
    } catch (error) {
      const reason = classifyStorageError(error);
      if (!TRIPS_THE_CONNECTION.has(reason)) throw error;
      await trip(ctx, row, { step, reason });
      throw byoUnavailable();
    }
  }

  /**
   * A customer object is reachable only through the verified connection pointing at its location.
   * A connection that failed its first check never held a file, so it counts as none at all.
   */
  function reach(row: StorageConnectionRow | undefined, address: ObjectAddress): 'ok' | 'failed' | 'disconnected' {
    if (!row || row.location_id !== address.storage_location_id || row.verified_at === null) return 'disconnected';
    if (row.status === 'verified') return 'ok';
    return row.status === 'failed' ? 'failed' : 'disconnected';
  }

  return {
    platform,
    platformConfigured: () => storage.private !== null,
    connection: (ctx: TenantContext) => configs.find(ctx),
    customer,
    guard,
    trip,
    notifyAdmins,

    /** Where a new upload goes: the customer's bucket once verified, the platform's otherwise. */
    async forUpload(
      ctx: TenantContext,
    ): Promise<{ target: StorageTarget; store: PrivateStore; row: StorageConnectionRow | null }> {
      const row = await configs.find(ctx);
      if (row?.status === 'verified') return { target: 'byo', store: customer(row), row };
      if (row?.status === 'failed' && row.verified_at !== null) throw byoUnavailable();
      return { target: 'platform', store: platform(), row: null };
    },

    /** The store holding an existing object, or why it cannot be reached. */
    async forObject(
      ctx: TenantContext,
      address: ObjectAddress,
    ): Promise<{ store: PrivateStore; row: StorageConnectionRow | null }> {
      if (address.storage_target === 'platform') return { store: platform(), row: null };
      const row = await configs.find(ctx);
      const state = reach(row, address);
      if (state === 'disconnected') throw new AppError('storage.byo_disconnected', 410);
      if (state === 'failed') throw byoUnavailable();
      return { store: customer(row!), row: row! };
    },

    /** Whether each object can be served now, reading the connection at most once. */
    async availability(
      ctx: TenantContext,
      addresses: readonly ObjectAddress[],
    ): Promise<(a: ObjectAddress) => boolean> {
      if (!addresses.some(a => a.storage_target === 'byo')) return () => true;
      const row = await configs.find(ctx);
      return a => a.storage_target === 'platform' || reach(row, a) === 'ok';
    },

    /**
     * Deletes each object the application may delete: every platform object, and a customer
     * object only through a verified connection to its location. Objects at any other location
     * are left where they are — the rows may go. A failing connection throws byo_unavailable,
     * so the caller keeps the rows and retries once someone fixes it.
     */
    async deleteObjects(ctx: TenantContext, addresses: readonly ObjectAddress[]): Promise<void> {
      if (addresses.length === 0) return;
      const row = addresses.some(a => a.storage_target === 'byo') ? await configs.find(ctx) : undefined;
      for (const address of addresses) {
        if (address.storage_target === 'platform') {
          await platform().delete(address.object_key);
          continue;
        }
        const state = reach(row, address);
        if (state === 'disconnected') continue;
        if (state === 'failed') throw byoUnavailable();
        await guard(ctx, row!, 'delete', () => customer(row!).delete(address.object_key));
      }
    },
  };
}

export type ObjectStores = ReturnType<typeof objectStores>;
