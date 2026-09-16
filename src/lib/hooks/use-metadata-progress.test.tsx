import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { useMetadataBatchProgress } from './use-metadata-progress'

const { mockGetStatuses, mockInvalidate } = vi.hoisted(() => ({
  mockGetStatuses: vi.fn(),
  mockInvalidate: vi.fn(),
}))

vi.mock('@/lib/api/pins', () => ({ getPinStatusesById: mockGetStatuses }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}))
vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

function Harness({ pinIds }: { pinIds: string[] | null }) {
  useMetadataBatchProgress(pinIds)
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('useMetadataBatchProgress', () => {
  it('does nothing without pin ids', () => {
    render(<Harness pinIds={null} />)
    expect(toast.loading).not.toHaveBeenCalled()
    expect(mockGetStatuses).not.toHaveBeenCalled()
  })

  it('polls the pin statuses and finishes with a success toast when all are done', async () => {
    mockGetStatuses
      .mockResolvedValueOnce([{ id: 'p1', status: 'generating_metadata' }])
      .mockResolvedValueOnce([{ id: 'p1', status: 'metadata_created' }])

    render(<Harness pinIds={['p1']} />)

    // Flush the initial poll (still generating -> loading stays).
    await vi.advanceTimersByTimeAsync(0)
    expect(toast.loading).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()

    // Next interval tick reads metadata_created -> success.
    await vi.advanceTimersByTimeAsync(2000)
    expect(toast.success).toHaveBeenCalledWith(
      'toast.metadata.bulkComplete',
      expect.objectContaining({ id: 'toast-id' }),
    )
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['pins'] })
  })

  it('finishes with a warning toast when some pins failed', async () => {
    mockGetStatuses.mockResolvedValue([
      { id: 'p1', status: 'metadata_created' },
      { id: 'p2', status: 'error' },
    ])

    render(<Harness pinIds={['p1', 'p2']} />)
    await vi.advanceTimersByTimeAsync(0)

    expect(toast.warning).toHaveBeenCalledWith(
      'toast.metadata.bulkPartial',
      expect.objectContaining({ id: 'toast-id' }),
    )
  })

  it('finishes with an error toast when every pin failed', async () => {
    mockGetStatuses.mockResolvedValue([
      { id: 'p1', status: 'error' },
      { id: 'p2', status: 'error' },
    ])

    render(<Harness pinIds={['p1', 'p2']} />)
    await vi.advanceTimersByTimeAsync(0)

    expect(toast.error).toHaveBeenCalledWith(
      'toast.metadata.bulkError',
      expect.objectContaining({ id: 'toast-id' }),
    )
  })
})
