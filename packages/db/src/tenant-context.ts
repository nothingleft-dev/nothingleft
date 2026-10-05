export interface TenantContext {
  readonly kind: 'tenant';
  readonly orgId: number;
  readonly userId: number | null;
}

// For identity tables that have no org_id (users, sessions, PATs). The reason
// keeps every cross-tenant read greppable — docs/backend-guide.md#identity-tables.
export interface SystemContext {
  readonly kind: 'system';
  readonly reason: string;
}

export type RepoContext = TenantContext | SystemContext;

export function tenantContext(orgId: number, userId: number | null = null): TenantContext {
  if (!orgId) throw new Error('TenantContext requires an orgId');
  return Object.freeze({ kind: 'tenant', orgId, userId });
}

export function systemContext(reason: string): SystemContext {
  if (!reason) throw new Error('SystemContext requires a reason');
  return Object.freeze({ kind: 'system', reason });
}
