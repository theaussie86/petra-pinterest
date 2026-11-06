import { describe, expect, it, vi } from 'vitest'
import { describeImageIntake, logImageIntake } from './image-intake-probe'

function toolCall(name: string, args: unknown, meta?: unknown) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
  }
}

describe('describeImageIntake', () => {
  it('records a hydrated file by shape, without the signed download URL', () => {
    const [record] = describeImageIntake(
      toolCall('create_pin', {
        project_id: 'p1',
        title: 'Geheimer Titel',
        image_file: {
          download_url: 'https://files.oaiusercontent.com/file-1/pin.png?sig=SECRET',
          file_id: 'file-1',
          mime_type: 'image/png',
          file_name: 'pin.png',
        },
      }),
    )

    expect(record.sources.image_file).toEqual({
      type: 'object',
      keys: ['download_url', 'file_id', 'mime_type', 'file_name'],
      download_url: {
        type: 'string',
        length: 58,
        preview: 'https://files.oaiusercontent.com',
      },
      mime_type: { type: 'string', length: 9, preview: 'image/png' },
    })
    expect(record.argKeys).toEqual(['project_id', 'title', 'image_file'])

    const logged = JSON.stringify(record)
    expect(logged).not.toContain('SECRET')
    expect(logged).not.toContain('Geheimer Titel')
  })

  it('records the string reference the mobile app reportedly sends', () => {
    const [record] = describeImageIntake(toolCall('create_pin', { image_file: 'chat_upload' }))
    expect(record.sources.image_file).toEqual({
      type: 'string',
      length: 11,
      preview: 'chat_upload',
    })
  })

  it('records a call with no file and which host sent it', () => {
    const [record] = describeImageIntake(
      toolCall(
        'create_pin',
        { project_id: 'p1' },
        { 'openai/userAgent': 'ChatGPT/1.0', 'openai/subject': 'hidden-subject' },
      ),
    )
    expect(record.sources.image_file).toEqual({ type: 'absent' })
    expect(record.metaFileParams).toEqual({ type: 'absent' })
    expect(record.metaKeys).toEqual(['openai/userAgent', 'openai/subject'])
    expect(record.hostUserAgent).toBe('ChatGPT/1.0')
    expect(JSON.stringify(record)).not.toContain('hidden-subject')
  })

  it('caps inline base64 to a short preview', () => {
    const data = 'A'.repeat(5000)
    const [record] = describeImageIntake(toolCall('create_pin', { image_base64: data }))
    expect(record.sources.image_base64).toEqual({
      type: 'string',
      length: 5000,
      preview: 'A'.repeat(32),
    })
  })

  it('ignores other tools and methods', () => {
    expect(describeImageIntake(toolCall('list_pins', {}))).toEqual([])
    expect(describeImageIntake({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual([])
    expect(describeImageIntake('nonsense')).toEqual([])
  })

  it('handles a JSON-RPC batch', () => {
    const records = describeImageIntake([
      toolCall('create_pin', {}),
      toolCall('list_pins', {}),
      toolCall('request_pin_upload', { content_type: 'image/png' }),
    ])
    expect(records.map((r) => r.tool)).toEqual(['create_pin', 'request_pin_upload'])
  })
})

describe('logImageIntake', () => {
  it('leaves the request body readable and survives an invalid body', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const body = JSON.stringify(toolCall('create_pin', { project_id: 'p1' }))
    const request = new Request('https://pinfinity.test/mcp', { method: 'POST', body })
    await logImageIntake(request, 'client-1')
    expect(await request.text()).toBe(body)
    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0][1]).toContain('client-1')

    const invalid = new Request('https://pinfinity.test/mcp', { method: 'POST', body: '{' })
    await expect(logImageIntake(invalid, null)).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledTimes(1)

    info.mockRestore()
  })
})
