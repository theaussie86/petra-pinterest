import { MockLanguageModelV2 } from 'ai/test'
import { generateArticleFromHtml } from './generate'
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
