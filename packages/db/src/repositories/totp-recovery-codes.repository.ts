import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Queryable } from '../client.ts';
import { totp_recovery_codes, type TotpRecoveryCodeRow } from '../schema/index.ts';
import type { SystemContext } from '../tenant-context.ts';

export function totpRecoveryCodesRepository(db: Queryable) {
  return {
    /** Unused codes are deleted; used ones stay as the record of when each was spent. */
    async replace(ctx: SystemContext, userId: number, hashes: Buffer[]): Promise<void> {
      await this.deleteUnused(ctx, userId);
      if (hashes.length === 0) return;
      await db.insert(totp_recovery_codes).values(hashes.map(code_hash => ({ user_id: userId, code_hash })));
    },

    async deleteUnused(_ctx: SystemContext, userId: number): Promise<void> {
      await db
        .delete(totp_recovery_codes)
        .where(and(eq(totp_recovery_codes.user_id, userId), isNull(totp_recovery_codes.used_at)));
    },

    /** Spends a code once: a second use of the same code finds nothing. */
    async consume(_ctx: SystemContext, userId: number, hash: Buffer): Promise<TotpRecoveryCodeRow | undefined> {
      const [row] = await db
        .update(totp_recovery_codes)
        .set({ used_at: new Date() })
        .where(
          and(
            eq(totp_recovery_codes.user_id, userId),
            eq(totp_recovery_codes.code_hash, hash),
            isNull(totp_recovery_codes.used_at),
          ),
        )
        .returning();
      return row;
    },

    async countUnused(_ctx: SystemContext, userId: number): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(totp_recovery_codes)
        .where(and(eq(totp_recovery_codes.user_id, userId), isNull(totp_recovery_codes.used_at)));
      return row?.n ?? 0;
    },
  };
}

export type TotpRecoveryCodesRepository = ReturnType<typeof totpRecoveryCodesRepository>;
