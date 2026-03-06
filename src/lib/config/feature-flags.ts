/**
 * Feature flags for Trigger.dev migration.
 * Set via environment variables to switch between Edge Functions and Trigger.dev.
 */
export const USE_TRIGGER_DEV = {
  metadata: process.env.USE_TRIGGER_METADATA === 'true',
  scraping: process.env.USE_TRIGGER_SCRAPING === 'true',
} as const

export function isTriggerDevEnabled(feature: keyof typeof USE_TRIGGER_DEV): boolean {
  return USE_TRIGGER_DEV[feature]
}
