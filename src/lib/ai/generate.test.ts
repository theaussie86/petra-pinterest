import { MockLanguageModelV3 } from 'ai/test'
import {
  generateArticleFromHtml,
  generatePinMetadata,
  generatePinMetadataWithFeedback,
} from './generate'
import { getRepairFireCount, resetRepairFireCount } from './repair'

function mockModelReturning(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      finishReason: { unified: 'stop', raw: undefined },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } },
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
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        seenPrompt = JSON.stringify(options.prompt)
        return {
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
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
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        seenPrompt = JSON.stringify(options.prompt)
        return {
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
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
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        seenPrompt = options.prompt
        return {
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
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

describe('generatePinMetadataWithFeedback()', () => {
  const previousMetadata = {
    title: 'Old Title',
    description: 'Old description',
    alt_text: 'Old alt text',
  }
  const refined = {
    title: 'Catchier Vegan Chocolate Cake',
    description: 'Rich, fudgy and ready in 30 minutes — get the full recipe now!',
    alt_text: 'On this pin you see a glossy slice of vegan chocolate cake',
  }
  const image = { bytes: new Uint8Array([5, 6, 7, 8]), mimeType: 'image/png' }

  it('builds a [user, assistant, user] message sequence and returns refined validated metadata', async () => {
    let seenPrompt: any = null
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        seenPrompt = options.prompt
        return {
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
          content: [{ type: 'text', text: JSON.stringify(refined) }],
          warnings: [],
        }
      },
    })

    const result = await generatePinMetadataWithFeedback({
      article: { title: 'Vegan Cake', content: 'Body' },
      image,
      mediaType: 'image',
      systemPrompt: 'sys',
      apiKey: 'unused',
      previousMetadata,
      feedback: 'Make it more catchy',
      model,
    })

    expect(result).toEqual(refined)
    expect(getRepairFireCount()).toBe(0)

    // Exactly three turns in order: user (text + image), assistant (prev JSON), user (feedback).
    const turns = seenPrompt.filter((m: any) => m.role !== 'system')
    expect(turns.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user'])

    const [firstUser, assistant, secondUser] = turns

    // First user turn carries the original prompt text plus the image part.
    const firstText = firstUser.content.find((p: any) => p.type === 'text')
    const imagePart = firstUser.content.find((p: any) => p.type === 'file' || p.type === 'image')
    expect(firstText.text).toContain('Pin Type: Image')
    expect(firstText.text).toContain('Article Title: Vegan Cake')
    expect(imagePart).toBeDefined()

    // Assistant turn replays the previous generation as JSON.
    const assistantText = assistant.content.find((p: any) => p.type === 'text')
    expect(JSON.parse(assistantText.text)).toEqual(previousMetadata)

    // Final user turn carries the feedback.
    const feedbackText = secondUser.content.find((p: any) => p.type === 'text')
    expect(feedbackText.text).toContain('Make it more catchy')
  })

  it('repairs malformed-but-recoverable refined output and still validates', async () => {
    const broken = `{"title":"T","description":"Line 1\nLine 2","alt_text":"A"}`
    expect(() => JSON.parse(broken)).toThrow()

    const result = await generatePinMetadataWithFeedback({
      article: { title: 'Vegan Cake', content: 'Body' },
      image,
      mediaType: 'image',
      systemPrompt: 'sys',
      apiKey: 'unused',
      previousMetadata,
      feedback: 'tighten it',
      model: mockModelReturning(broken),
    })

    expect(result.description).toBe('Line 1\nLine 2')
    expect(getRepairFireCount()).toBe(1)
  })
})
