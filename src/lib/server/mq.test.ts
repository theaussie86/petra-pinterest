import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enqueuePublishPin, cancelPublishPin, MqError } from './mq'

const originalEnv = { ...process.env }

/** A fetch rejection that looks like an `AbortSignal.timeout()` abort. */
function timeoutError(): Error {
  return Object.assign(new Error('The operation timed out'), {
    name: 'TimeoutError',
  })
}

beforeEach(() => {
  process.env.MQ_API_URL = 'https://mq.test'
  process.env.MQ_API_KEY = 'mq_test_key'
  vi.restoreAllMocks()
  // Silence the expected error logging from the failure paths.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('enqueuePublishPin', () => {
  it('POSTs a replace job with the computed delay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'))
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'publish-pin-abc' }), {
        status: 201,
      }),
    )

    const result = await enqueuePublishPin({
      pinId: 'abc',
      scheduledAt: '2026-10-10T12:01:00.000Z', // +60s
      tenantId: 'tenant-1',
    })

    expect(result).toEqual({ status: 'enqueued' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mq.test/jobs')
    expect(options.method).toBe('POST')
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer mq_test_key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(options.body as string)).toEqual({
      type: 'pinfinity.publish-pin',
      tenant: 'tenant-1',
      jobId: 'publish-pin-abc',
      onExisting: 'replace',
      delay: 60000,
      payload: {
        supabaseCredential: 'pinfinity-supabase',
        pinId: 'abc',
        scheduledAt: '2026-10-10T12:01:00.000Z',
      },
    })
  })

  it('clamps a past scheduledAt to delay 0', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'))
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{}', { status: 201 }),
    )

    await enqueuePublishPin({
      pinId: 'abc',
      scheduledAt: '2026-10-10T11:00:00.000Z', // one hour ago
      tenantId: 'tenant-1',
    })

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(options.body as string).delay).toBe(0)
  })

  it('returns a typed http error on a non-2xx response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    )

    const result = await enqueuePublishPin({
      pinId: 'abc',
      scheduledAt: new Date().toISOString(),
      tenantId: 'tenant-1',
    })

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error).toBeInstanceOf(MqError)
    expect(result.error.kind).toBe('http')
    expect(result.error.status).toBe(403)
  })

  it('maps an aborted request to a timeout error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(timeoutError())

    const result = await enqueuePublishPin({
      pinId: 'abc',
      scheduledAt: new Date().toISOString(),
      tenantId: 'tenant-1',
    })

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error.kind).toBe('timeout')
  })

  it('maps a generic fetch rejection to a network error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await enqueuePublishPin({
      pinId: 'abc',
      scheduledAt: new Date().toISOString(),
      tenantId: 'tenant-1',
    })

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error.kind).toBe('network')
  })

  it('returns a config error without calling fetch when env is missing', async () => {
    delete process.env.MQ_API_KEY
    const fetchMock = vi.spyOn(global, 'fetch')

    const result = await enqueuePublishPin({
      pinId: 'abc',
      scheduledAt: new Date().toISOString(),
      tenantId: 'tenant-1',
    })

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error.kind).toBe('config')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('cancelPublishPin', () => {
  it('DELETEs the job with the queue param and no body, cancelled on 200', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ removed: true }), { status: 200 }),
    )

    const result = await cancelPublishPin('abc')

    expect(result).toEqual({ status: 'cancelled' })
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mq.test/jobs/publish-pin-abc?queue=integrations')
    expect(options.method).toBe('DELETE')
    expect(options.body).toBeUndefined()
    expect(options.headers).toMatchObject({ Authorization: 'Bearer mq_test_key' })
    expect(options.headers).not.toHaveProperty('Content-Type')
  })

  it('treats 404 as success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    await expect(cancelPublishPin('abc')).resolves.toEqual({ status: 'cancelled' })
  })

  it('reports a running job (409) without an error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'active', state: 'active' }), {
        status: 409,
      }),
    )
    await expect(cancelPublishPin('abc')).resolves.toEqual({ status: 'running' })
  })

  it('returns a typed http error on an unexpected status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }))

    const result = await cancelPublishPin('abc')

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error.kind).toBe('http')
    expect(result.error.status).toBe(500)
  })

  it('maps an aborted request to a timeout error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(timeoutError())

    const result = await cancelPublishPin('abc')

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error.kind).toBe('timeout')
  })

  it('returns a config error without calling fetch when env is missing', async () => {
    delete process.env.MQ_API_URL
    const fetchMock = vi.spyOn(global, 'fetch')

    const result = await cancelPublishPin('abc')

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.error.kind).toBe('config')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
