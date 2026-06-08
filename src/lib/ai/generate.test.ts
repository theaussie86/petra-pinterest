import { MockLanguageModelV2 } from 'ai/test'
import { generateArticleFromHtml, generatePinMetadata } from './generate'
import { getRepairFireCount, resetRepairFireCount } from './repair'

function mockModelReturning(text: string) {
  return new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [{ type: 'text', text }],
      warnings: [],
    }),
  })
}

const article = {
  title: 'Blog Post Title',
  content: '# Blog Post\n\nContent here',
  published_at: '2025-01-15',
  author: 'Jane Doe',
  excerpt: 'A summary',
}

beforeEach(() => {
  resetRepairFireCount()
})

describe('generateArticleFromHtml()', () => {
  it('returns a Zod-validated ScrapedArticle on the happy path (no repair)', async () => {
    const result = await generateArticleFromHtml({
      html: '<html><body><h1>Blog Post Title</h1></body></html>',
      url: 'https://blog.com/post',
      apiKey: 'unused',
      model: mockModelReturning(JSON.stringify(article)),
    })

    expect(result).toEqual(article)
    expect(getRepairFireCount()).toBe(0)
  })

  it('repairs malformed-but-recoverable model output and still validates', async () => {
    // Literal newline inside a JSON string — invalid JSON until repaired.
    const broken = '{"title":"T","content":"Line 1\nLine 2","excerpt":"E"}'
    expect(() => JSON.parse(broken)).toThrow()

    const result = await generateArticleFromHtml({
      html: '<html></html>',
      url: 'https://blog.com/post',
      apiKey: 'unused',
      model: mockModelReturning(broken),
    })

    expect(result.title).toBe('T')
    expect(result.content).toBe('Line 1\nLine 2')
    expect(getRepairFireCount()).toBe(1)
  })

  it('passes the URL through to the model prompt', async () => {
    let seenPrompt = ''
    const model = new MockLanguageModelV2({
      doGenerate: async (options) => {
        seenPrompt = JSON.stringify(options.prompt)
        return {
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: 'text', text: JSON.stringify(article) }],
          warnings: [],
        }
      },
    })

    await generateArticleFromHtml({
      html: '<html></html>',
      url: 'https://blog.com/unique-path',
      apiKey: 'unused',
      model,
    })

    expect(seenPrompt).toContain('https://blog.com/unique-path')
  })
})

describe('generatePinMetadata()', () => {
  const metadata = {
    title: 'Easy Vegan Chocolate Cake Recipe',
    description: 'A rich, fudgy vegan chocolate cake in 30 minutes. Get the recipe!',
    alt_text: 'On this pin you see a slice of chocolate cake on a white plate',
  }
  const image = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/png' }

  it('returns a Zod-validated GeneratedMetadata on the happy path (image pin)', async () => {
    const result = await generatePinMetadata({
      article: { title: 'Vegan Cake', content: 'Body' },
      image,
      mediaType: 'image',
      systemPrompt: 'sys',
      apiKey: 'unused',
      model: mockModelReturning(JSON.stringify(metadata)),
    })

    expect(result).toEqual(metadata)
    expect(getRepairFireCount()).toBe(0)
  })

  it('repairs malformed-but-recoverable model output and still validates', async () => {
    // Literal newline inside a JSON string — invalid JSON until repaired.
    const broken = `{"title":"T","description":"Line 1\nLine 2","alt_text":"A"}`
    expect(() => JSON.parse(broken)).toThrow()

    const result = await generatePinMetadata({
      article: { title: 'Vegan Cake', content: 'Body' },
      image,
      mediaType: 'image',
      systemPrompt: 'sys',
      apiKey: 'unused',
      model: mockModelReturning(broken),
    })

    expect(result.description).toBe('Line 1\nLine 2')
    expect(getRepairFireCount()).toBe(1)
  })

  it('produces the image-only prompt when no article is linked', async () => {
    let seenPrompt = ''
    const model = new MockLanguageModelV2({
      doGenerate: async (options) => {
        seenPrompt = JSON.stringify(options.prompt)
        return {
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: 'text', text: JSON.stringify(metadata) }],
          warnings: [],
        }
      },
    })

    await generatePinMetadata({
      article: null,
      image,
      mediaType: 'image',
      systemPrompt: 'sys',
      apiKey: 'unused',
      model,
    })

    expect(seenPrompt).toContain('No article linked')
    expect(seenPrompt).toContain('Pin Type: Image')
    expect(seenPrompt).not.toContain('Article Title')
  })

  it('flows video keyframe bytes through the same image part and marks the video pin type', async () => {
    let seenPrompt: any = null
    const keyframe = { bytes: new Uint8Array([9, 8, 7]), mimeType: 'image/jpeg' }
    const model = new MockLanguageModelV2({
      doGenerate: async (options) => {
        seenPrompt = options.prompt
        return {
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: 'text', text: JSON.stringify(metadata) }],
          warnings: [],
        }
      },
    })

    const result = await generatePinMetadata({
      article: { title: 'Vegan Cake', content: 'Body' },
      image: keyframe,
      mediaType: 'video',
      systemPrompt: 'sys',
      apiKey: 'unused',
      model,
    })

    expect(result).toEqual(metadata)

    // The user message carries a file/image part built from the keyframe bytes.
    const userMessage = seenPrompt.find((m: any) => m.role === 'user')
    const textPart = userMessage.content.find((p: any) => p.type === 'text')
    const filePart = userMessage.content.find((p: any) => p.type === 'file' || p.type === 'image')
    expect(textPart.text).toContain('Pin Type: Video')
    expect(filePart).toBeDefined()
  })
})
