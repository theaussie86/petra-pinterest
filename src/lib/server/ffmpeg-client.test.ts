import { extractKeyframe } from './ffmpeg-client'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.FFMPEG_SERVER_URL = 'https://util.weissteiner-automation.com'
  process.env.FFMPEG_SERVER_TOKEN = 'test-token'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

// Build an "image" Response that mimics the ffmpeg server's /thumbnail output.
function imageResponse(
  bytes: Uint8Array,
  contentType: 'image/jpeg' | 'image/png' = 'image/jpeg',
) {
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': contentType },
  })
}

describe('extractKeyframe', () => {
  it('POSTs JSON to /thumbnail with bearer auth and returns image bytes', async () => {
    const mockBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) // JPEG magic
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(imageResponse(mockBytes))

    const result = await extractKeyframe('https://cdn.example.com/video.mp4')

    expect(result.contentType).toBe('image/jpeg')
    expect(Array.from(result.bytes)).toEqual(Array.from(mockBytes))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://util.weissteiner-automation.com/thumbnail')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Accept).toBe('image/jpeg')
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://cdn.example.com/video.mp4',
      second: 1,
      format: 'jpeg',
    })
  })

  it('uses provided options (second, format, quality)', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(imageResponse(new Uint8Array([0x89, 0x50]), 'image/png'))

    await extractKeyframe('https://cdn.example.com/video.mp4', {
      second: 5,
      format: 'png',
      quality: 2,
    })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Accept).toBe('image/png')
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://cdn.example.com/video.mp4',
      second: 5,
      format: 'png',
      quality: 2,
    })
  })

  it('strips trailing slash from FFMPEG_SERVER_URL', async () => {
    process.env.FFMPEG_SERVER_URL = 'https://util.weissteiner-automation.com/'
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(imageResponse(new Uint8Array([1])))

    await extractKeyframe('https://cdn.example.com/video.mp4')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://util.weissteiner-automation.com/thumbnail',
      expect.any(Object),
    )
  })

  it('returns image/png when the server responds with PNG bytes', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      imageResponse(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png'),
    )

    const result = await extractKeyframe('https://cdn.example.com/video.mp4', {
      format: 'png',
    })
    expect(result.contentType).toBe('image/png')
  })

  it('throws when FFMPEG_SERVER_URL is missing', async () => {
    delete process.env.FFMPEG_SERVER_URL
    await expect(extractKeyframe('https://cdn.example.com/v.mp4')).rejects.toThrow(
      /FFMPEG_SERVER_URL is not configured/,
    )
  })

  it('throws when FFMPEG_SERVER_TOKEN is missing', async () => {
    delete process.env.FFMPEG_SERVER_TOKEN
    await expect(extractKeyframe('https://cdn.example.com/v.mp4')).rejects.toThrow(
      /FFMPEG_SERVER_TOKEN is not configured/,
    )
  })

  it('throws with the server error code and message on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'THUMBNAIL_OUT_OF_RANGE', message: 'beyond end of video' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(
      extractKeyframe('https://cdn.example.com/v.mp4', { second: 99999 }),
    ).rejects.toThrow(/THUMBNAIL_OUT_OF_RANGE: beyond end of video/)
  })

  it('falls back to status line when error body is not JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('<html>500</html>', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    )

    await expect(
      extractKeyframe('https://cdn.example.com/v.mp4'),
    ).rejects.toThrow(/500 Internal Server Error/)
  })

  it('throws when the server returns unexpected Content-Type', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('not an image', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    await expect(
      extractKeyframe('https://cdn.example.com/v.mp4'),
    ).rejects.toThrow(/unexpected Content-Type: text\/plain/)
  })
})
