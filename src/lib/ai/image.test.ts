import { fetchImageBytes } from './image'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchImageBytes()', () => {
  it('returns Uint8Array bytes and the response content-type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
        headers: new Headers({ 'content-type': 'image/png' }),
      }),
    )

    const result = await fetchImageBytes('https://storage.example.com/i.png')
    expect(result.bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(result.bytes)).toEqual([1, 2, 3])
    expect(result.mimeType).toBe('image/png')
  })

  it('falls back to image/jpeg when content-type header is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        headers: new Headers(),
      }),
    )

    const result = await fetchImageBytes('https://storage.example.com/i')
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('throws when the fetch response is not OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        headers: new Headers(),
      }),
    )

    await expect(fetchImageBytes('https://storage.example.com/missing')).rejects.toThrow(
      'Failed to fetch image: 404',
    )
  })
})
