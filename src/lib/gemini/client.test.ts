import { generatePinMetadata, generatePinMetadataWithFeedback, generateArticleFromHtml } from './client'

const { mockGenerateContent, mockSendMessage, mockCreate } = vi.hoisted(() => {
  const mockSendMessage = vi.fn()
  const mockCreate = vi.fn()
  const mockGenerateContent = vi.fn()
  return { mockGenerateContent, mockSendMessage, mockCreate }
})

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
    chats: { create: mockCreate },
  })),
}))

// Mock fetch for fetchImageAsBase64
const mockFetch = vi.fn().mockResolvedValue({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  headers: new Headers({ 'content-type': 'image/png' }),
})
vi.stubGlobal('fetch', mockFetch)

describe('generatePinMetadata()', () => {
  it('fetches image, calls Gemini, returns parsed metadata', async () => {
    const metadata = { title: 'Pin Title', description: 'Pin desc', alt_text: 'Alt text' }
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(metadata) })

    const result = await generatePinMetadata(
      'Article Title',
      'Article content here',
      'https://storage.example.com/image.png',
      undefined,
      'test-api-key',
    )

    expect(result).toEqual(metadata)

    // Verify image was fetched
    expect(mockFetch).toHaveBeenCalledWith('https://storage.example.com/image.png')

    // Verify Gemini was called with content and image
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: expect.arrayContaining([
          expect.objectContaining({ text: expect.stringContaining('Article Title') }),
          expect.objectContaining({
            inlineData: expect.objectContaining({ mimeType: 'image/png' }),
          }),
        ]),
      }),
    )
  })

  it('truncates article content to 4000 characters', async () => {
    const metadata = { title: 'T', description: 'D', alt_text: 'A' }
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(metadata) })

    const longContent = 'x'.repeat(10000)
    await generatePinMetadata('Title', longContent, 'https://img.com/pic.png', undefined, 'key')

    const callArgs = mockGenerateContent.mock.calls[0][0]
    const textContent = callArgs.contents[0].text
    // 4000 chars of content + "Article Title: Title\n\nArticle Content: " prefix
    expect(textContent.length).toBeLessThanOrEqual(4100)
  })

  it('uses custom system prompt when provided', async () => {
    const metadata = { title: 'T', description: 'D', alt_text: 'A' }
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(metadata) })

    await generatePinMetadata('Title', 'Content', 'https://img.com/pic.png', 'Custom prompt', 'key')

    const callArgs = mockGenerateContent.mock.calls[0][0]
    expect(callArgs.config.systemInstruction).toBe('Custom prompt')
  })

  it('builds image-only prompt when article title is null', async () => {
    const metadata = { title: 'T', description: 'D', alt_text: 'A' }
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(metadata) })

    await generatePinMetadata(null, null, 'https://img.com/pic.png', undefined, 'key')

    const callArgs = mockGenerateContent.mock.calls[0][0]
    const textContent = callArgs.contents[0].text
    expect(textContent).not.toContain('Article Title')
    expect(textContent).toContain('No article linked')
  })

  it('throws on empty Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: null })

    await expect(
      generatePinMetadata('Title', 'Content', 'https://img.com/pic.png', undefined, 'key'),
    ).rejects.toThrow('Gemini returned empty response')
  })

  it('throws on malformed JSON response', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'not json' })

    await expect(
      generatePinMetadata('Title', 'Content', 'https://img.com/pic.png', undefined, 'key'),
    ).rejects.toThrow()
  })
})

describe('generatePinMetadataWithFeedback()', () => {
  it('creates chat with history and sends feedback message', async () => {
    const previousMetadata = { title: 'Old', description: 'Old desc', alt_text: 'Old alt' }
    const newMetadata = { title: 'New', description: 'New desc', alt_text: 'New alt' }

    mockSendMessage.mockResolvedValueOnce({ text: JSON.stringify(newMetadata) })
    mockCreate.mockReturnValueOnce({ sendMessage: mockSendMessage })

    const result = await generatePinMetadataWithFeedback(
      'Article Title',
      'Article content',
      'https://img.com/pic.png',
      previousMetadata,
      'Make it more catchy',
      'test-api-key',
    )

    expect(result).toEqual(newMetadata)

    // Verify chat was created with history
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        history: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
          expect.objectContaining({
            role: 'model',
            parts: [{ text: JSON.stringify(previousMetadata) }],
          }),
        ]),
      }),
    )

    // Verify feedback was sent
    expect(mockSendMessage).toHaveBeenCalledWith({
      message: expect.stringContaining('Make it more catchy'),
    })
  })

  it('builds image-only prompt in history when article is null', async () => {
    const previousMetadata = { title: 'Old', description: 'Old desc', alt_text: 'Old alt' }
    const newMetadata = { title: 'New', description: 'New desc', alt_text: 'New alt' }

    mockSendMessage.mockResolvedValueOnce({ text: JSON.stringify(newMetadata) })
    mockCreate.mockReturnValueOnce({ sendMessage: mockSendMessage })

    await generatePinMetadataWithFeedback(
      null,
      null,
      'https://img.com/pic.png',
      previousMetadata,
      'feedback',
      'key',
    )

    const chatArgs = mockCreate.mock.calls[0][0]
    const userText = chatArgs.history[0].parts[0].text
    expect(userText).not.toContain('Article Title')
    expect(userText).toContain('No article linked')
  })

  it('throws on empty chat response', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: null })
    mockCreate.mockReturnValueOnce({ sendMessage: mockSendMessage })

    await expect(
      generatePinMetadataWithFeedback(
        'Title',
        'Content',
        'https://img.com/pic.png',
        { title: 'T', description: 'D', alt_text: 'A' },
        'feedback',
        'key',
      ),
    ).rejects.toThrow('Gemini returned empty response')
  })
})

describe('generateArticleFromHtml()', () => {
  it('extracts article content from HTML via Gemini', async () => {
    const article = {
      title: 'Blog Post Title',
      content: '# Blog Post\n\nContent here',
      published_at: '2025-01-15',
      author: 'Jane Doe',
      excerpt: 'A summary',
    }
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(article) })

    const result = await generateArticleFromHtml(
      '<html><body><h1>Blog Post Title</h1></body></html>',
      'https://blog.com/post',
      'test-api-key',
    )

    expect(result).toEqual(article)
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: [{ text: expect.stringContaining('https://blog.com/post') }],
        config: expect.objectContaining({
          temperature: 0.1,
          responseMimeType: 'application/json',
        }),
      }),
    )
  })

  it('truncates HTML to 100000 characters', async () => {
    const article = { title: 'T', content: 'C' }
    mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(article) })

    const hugeHtml = 'x'.repeat(200000)
    await generateArticleFromHtml(hugeHtml, 'https://blog.com', 'key')

    const callArgs = mockGenerateContent.mock.calls[0][0]
    const textContent = callArgs.contents[0].text
    // 100000 chars of HTML + "URL: ...\n\nHTML Content:\n" prefix
    expect(textContent.length).toBeLessThanOrEqual(100100)
  })

  it('throws on empty response', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: null })

    await expect(
      generateArticleFromHtml('<html></html>', 'https://blog.com', 'key'),
    ).rejects.toThrow('Gemini returned empty response')
  })
})
