import { computeMetadataProgress } from './metadata-progress'
import type { PinStatus } from '@/types/pins'

describe('computeMetadataProgress', () => {
  it('reports all pins still in progress while none reached a terminal status', () => {
    const statuses: PinStatus[] = ['generating_metadata', 'generating_metadata']

    const progress = computeMetadataProgress(statuses, 2)

    expect(progress).toEqual({
      total: 2,
      done: 0,
      failed: 0,
      pending: 2,
      finished: false,
      outcome: null,
    })
  })

  it('counts metadata_created as done and error as failed', () => {
    const statuses: PinStatus[] = ['metadata_created', 'generating_metadata', 'error']

    const progress = computeMetadataProgress(statuses, 3)

    expect(progress.done).toBe(1)
    expect(progress.failed).toBe(1)
    expect(progress.pending).toBe(1)
    expect(progress.finished).toBe(false)
  })

  it('finishes with success when every pin reached metadata_created', () => {
    const statuses: PinStatus[] = ['metadata_created', 'metadata_created']

    const progress = computeMetadataProgress(statuses, 2)

    expect(progress.finished).toBe(true)
    expect(progress.outcome).toBe('success')
  })

  it('finishes with partial when some pins failed and some succeeded', () => {
    const statuses: PinStatus[] = ['metadata_created', 'error']

    const progress = computeMetadataProgress(statuses, 2)

    expect(progress.finished).toBe(true)
    expect(progress.outcome).toBe('partial')
  })

  it('finishes with error when every pin failed', () => {
    const statuses: PinStatus[] = ['error', 'error']

    const progress = computeMetadataProgress(statuses, 2)

    expect(progress.finished).toBe(true)
    expect(progress.outcome).toBe('error')
  })

  it('counts a pin already published as done (auto-publish between polls)', () => {
    const statuses: PinStatus[] = ['published', 'metadata_created']

    const progress = computeMetadataProgress(statuses, 2)

    expect(progress.done).toBe(2)
    expect(progress.outcome).toBe('success')
  })

  it('treats missing rows (deleted pins) as still pending against the requested total', () => {
    // Only one row returned but two pins were requested.
    const statuses: PinStatus[] = ['metadata_created']

    const progress = computeMetadataProgress(statuses, 2)

    expect(progress.pending).toBe(1)
    expect(progress.finished).toBe(false)
  })

  it('is not finished for an empty request', () => {
    const progress = computeMetadataProgress([], 0)

    expect(progress.finished).toBe(false)
    expect(progress.outcome).toBe(null)
  })
})
