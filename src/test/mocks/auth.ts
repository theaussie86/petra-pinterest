/**
 * Mock for ensureProfile() from @/lib/auth.
 *
 * Default: resolves with test tenant_id.
 * Override per-test via vi.mocked(ensureProfile).mockResolvedValueOnce(...)
 */

import { vi } from 'vitest'

export const TEST_TENANT_ID = 'test-tenant-id'

export const mockEnsureProfile = vi.fn().mockResolvedValue({
  tenant_id: TEST_TENANT_ID,
})
