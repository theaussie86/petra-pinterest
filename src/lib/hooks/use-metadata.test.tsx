import { render, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMetadataHistory } from './use-metadata'

const { mockGetMetadataHistory } = vi.hoisted(() => ({
  mockGetMetadataHistory: vi.fn(),
}))

vi.mock('@/lib/api/metadata', () => ({
  getMetadataHistory: (...args: unknown[]) => mockGetMetadataHistory(...args),
  restoreMetadataGeneration: vi.fn(),
}))

function Harness({ pinId, enabled }: { pinId: string; enabled?: boolean }) {
  useMetadataHistory(pinId, { enabled })
  return null
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMetadataHistory.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

describe('useMetadataHistory', () => {
  it('does not query while the history dialog is closed (enabled: false)', async () => {
    renderWithClient(<Harness pinId="pin1" enabled={false} />)
    // Give any pending query a chance to fire before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockGetMetadataHistory).not.toHaveBeenCalled()
  })

  it('queries the history once the dialog is open (enabled: true)', async () => {
    renderWithClient(<Harness pinId="pin1" enabled={true} />)
    await waitFor(() => expect(mockGetMetadataHistory).toHaveBeenCalledWith('pin1'))
  })

  it('does not query without a pin id even when enabled', async () => {
    renderWithClient(<Harness pinId="" enabled={true} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockGetMetadataHistory).not.toHaveBeenCalled()
  })

  it('queries by default when no options are passed (backwards compatible)', async () => {
    function DefaultHarness() {
      useMetadataHistory('pin1')
      return null
    }
    renderWithClient(<DefaultHarness />)
    await waitFor(() => expect(mockGetMetadataHistory).toHaveBeenCalledWith('pin1'))
  })
})
