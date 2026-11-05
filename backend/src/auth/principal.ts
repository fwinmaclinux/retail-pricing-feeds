export type Role = 'STORE_MANAGER' | 'PRICING_ANALYST' | 'PRICING_ADMIN';

/**
 * The authenticated caller. In production these claims come from the corporate IdP
 * (OIDC access token) enriched with the user's store/country entitlements.
 */
export interface Principal {
  userId: string;
  displayName: string;
  role: Role;
  /** Stores a STORE_MANAGER may see and change. */
  storeIds: string[];
  /** Countries a PRICING_ANALYST may see and change. */
  countryCodes: string[];
}

/** Demo personas for AUTH_MODE=dev. Each one exercises a different data scope. */
export const DEV_PERSONAS: Principal[] = [
  { userId: 'sm.london', displayName: 'Amelia Clarke', role: 'STORE_MANAGER', storeIds: ['GB-LON-001'], countryCodes: [] },
  { userId: 'sm.mumbai', displayName: 'Rohan Mehta', role: 'STORE_MANAGER', storeIds: ['IN-MUM-001'], countryCodes: [] },
  { userId: 'pa.india', displayName: 'Priya Nair', role: 'PRICING_ANALYST', storeIds: [], countryCodes: ['IN'] },
  { userId: 'pa.europe', displayName: 'Lukas Weber', role: 'PRICING_ANALYST', storeIds: [], countryCodes: ['GB', 'DE', 'FR'] },
  { userId: 'admin.hq', displayName: 'Jordan Lee', role: 'PRICING_ADMIN', storeIds: [], countryCodes: [] },
];

export function canAccessStore(p: Principal, store: { storeId: string; countryCode: string }): boolean {
  switch (p.role) {
    case 'PRICING_ADMIN':
      return true;
    case 'PRICING_ANALYST':
      return p.countryCodes.includes(store.countryCode);
    case 'STORE_MANAGER':
      return p.storeIds.includes(store.storeId);
  }
}

/**
 * Row-level data scoping appended to every price query, so a user can never read or
 * write outside their entitlement even if the client sends a broader filter.
 */
export function scopeClause(p: Principal, alias: string, nextParam: number): { sql: string; params: unknown[] } {
  switch (p.role) {
    case 'PRICING_ADMIN':
      return { sql: 'TRUE', params: [] };
    case 'PRICING_ANALYST':
      return { sql: `${alias}.country_code = ANY($${nextParam}::text[])`, params: [p.countryCodes] };
    case 'STORE_MANAGER':
      return { sql: `${alias}.store_id = ANY($${nextParam}::text[])`, params: [p.storeIds] };
  }
}
