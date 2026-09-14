import type { AuthUser } from '@/lib/server/auth'

/**
 * Per-tenant feature flags, stored in `public.tenant_features`
 * (migration 00031_tenant_features.sql). Keep in sync with the CHECK constraint.
 */
export type FeatureKey = 'pin_werkstatt'

/**
 * True when the user's tenant has the feature enabled. Fails closed: a missing
 * user or missing flag list means the feature is off.
 */
export function hasFeature(user: Pick<AuthUser, 'features'> | null | undefined, feature: FeatureKey): boolean {
  return user?.features?.includes(feature) ?? false
}
