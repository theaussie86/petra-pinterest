import {
  generatePinMetadata,
  generatePinMetadataWithFeedback,
  generateArticleFromHtml,
  sanitizeJsonResponse,
} from './client'

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

  it('parses response with literal newlines in description string', async () => {
    // Gemini sometimes outputs literal newlines inside JSON string values
    // despite using responseMimeType: 'application/json'
    const raw = '{\n  "title": "Title",\n  "description": "Line 1\nLine 2\n\nLine 3",\n  "alt_text": "Alt"\n}'
    mockGenerateContent.mockResolvedValueOnce({ text: raw })

    const result = await generatePinMetadata(
      'Article',
      'Content',
      'https://img.com/pic.png',
      undefined,
      'key',
    )

    expect(result.title).toBe('Title')
    expect(result.description).toBe('Line 1\nLine 2\n\nLine 3')
    expect(result.alt_text).toBe('Alt')
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

describe('sanitizeJsonResponse()', () => {
  describe('Basic Functionality', () => {
    it('passes through valid JSON unchanged', () => {
      const input = '{"title":"Test","value":123,"flag":true}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles empty string', () => {
      expect(sanitizeJsonResponse('')).toBe('')
    })

    it('handles JSON with no strings', () => {
      const input = '{}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('escapes simple newline in string value', () => {
      const input = '{"desc":"Line 1\nLine 2"}'
      const expected = '{"desc":"Line 1\\nLine 2"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('leaves control characters outside strings unchanged', () => {
      const input = '{\n  "title": "Test"\n}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })
  })

  describe('State Machine / String Tracking', () => {
    it('handles multiple string values with control chars', () => {
      const input = '{"a":"value\n1","b":"value\t2"}'
      const expected = '{"a":"value\\n1","b":"value\\t2"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles empty strings', () => {
      const input = '{"empty":"","filled":"a\nb"}'
      const expected = '{"empty":"","filled":"a\\nb"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles adjacent strings', () => {
      const input = '{"a":"x\n","b":"y\r"}'
      const expected = '{"a":"x\\n","b":"y\\r"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles nested objects', () => {
      const input = '{"outer":{"inner":"text\nhere"}}'
      const expected = '{"outer":{"inner":"text\\nhere"}}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles arrays with string values', () => {
      const input = '{"items":["item1\n","item2\t","item3"]}'
      const expected = '{"items":["item1\\n","item2\\t","item3"]}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles string at start of JSON', () => {
      const input = '"value\nwith\nnewlines"'
      const expected = '"value\\nwith\\nnewlines"'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles string at end of JSON', () => {
      const input = '{"last":"value\n"}'
      const expected = '{"last":"value\\n"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })
  })

  describe('Escape Sequence Handling', () => {
    it('does not double-escape already escaped newline', () => {
      const input = '{"text":"line\\nbreak"}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('does not double-escape already escaped tab', () => {
      const input = '{"text":"tab\\there"}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles escaped quote inside string', () => {
      const input = '{"text":"He said \\"hello\\""}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles escaped backslash', () => {
      const input = '{"path":"C:\\\\"}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles escaped backslash followed by literal newline', () => {
      const input = '{"text":"backslash\\\\\nthen newline"}'
      const expected = '{"text":"backslash\\\\\\nthen newline"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles multiple consecutive backslashes', () => {
      const input = '{"path":"C:\\\\\\\\"}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles mixed escaped and literal control chars', () => {
      const input = '{"mix":"already\\nescaped and literal\nnewline"}'
      const expected = '{"mix":"already\\nescaped and literal\\nnewline"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles backslash at end of string', () => {
      const input = '{"ending":"value\\\\"}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })
  })

  describe('Control Character Types', () => {
    describe('Common control characters', () => {
      it('escapes newline (U+000A)', () => {
        const input = '{"text":"line\nbreak"}'
        const expected = '{"text":"line\\nbreak"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes carriage return (U+000D)', () => {
        const input = '{"text":"line\rbreak"}'
        const expected = '{"text":"line\\rbreak"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes tab (U+0009)', () => {
        const input = '{"text":"tab\there"}'
        const expected = '{"text":"tab\\there"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes backspace (U+0008)', () => {
        const input = '{"text":"back\bspace"}'
        const expected = '{"text":"back\\bspace"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes form feed (U+000C)', () => {
        const input = '{"text":"form\ffeed"}'
        const expected = '{"text":"form\\ffeed"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes multiple control chars in one string', () => {
        const input = '{"text":"A\nB\rC\tD\bE\fF"}'
        const expected = '{"text":"A\\nB\\rC\\tD\\bE\\fF"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })
    })

    describe('Other control characters (\\uXXXX format)', () => {
      it('escapes null character (U+0000)', () => {
        const input = '{"text":"null\x00char"}'
        const expected = '{"text":"null\\u0000char"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes start of heading (U+0001)', () => {
        const input = '{"text":"soh\x01char"}'
        const expected = '{"text":"soh\\u0001char"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes bell (U+0007)', () => {
        const input = '{"text":"bell\x07char"}'
        const expected = '{"text":"bell\\u0007char"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes escape character (U+001B)', () => {
        const input = '{"text":"esc\x1Bchar"}'
        const expected = '{"text":"esc\\u001bchar"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes unit separator (U+001F) - last control char', () => {
        const input = '{"text":"unit\x1Fsep"}'
        const expected = '{"text":"unit\\u001fsep"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })

      it('escapes control char but not space (boundary test U+001F vs U+0020)', () => {
        const input = '{"text":"ctrl\x1F normal"}'
        const expected = '{"text":"ctrl\\u001f normal"}'
        expect(sanitizeJsonResponse(input)).toBe(expected)
      })
    })

    describe('Systematic control character coverage', () => {
      it('escapes all control characters 0x00-0x1F', () => {
        // Test all control character codes systematically
        for (let code = 0x00; code <= 0x1f; code++) {
          const char = String.fromCharCode(code)
          const input = `{"text":"before${char}after"}`
          const result = sanitizeJsonResponse(input)

          // Verify the control char was escaped
          if (code === 0x0a) {
            // Newline
            expect(result).toContain('\\n')
          } else if (code === 0x0d) {
            // Carriage return
            expect(result).toContain('\\r')
          } else if (code === 0x09) {
            // Tab
            expect(result).toContain('\\t')
          } else if (code === 0x08) {
            // Backspace
            expect(result).toContain('\\b')
          } else if (code === 0x0c) {
            // Form feed
            expect(result).toContain('\\f')
          } else {
            // Other control chars use \uXXXX format
            expect(result).toContain('\\u')
          }

          // Verify the literal control char is NOT in the output
          expect(result).not.toContain(char)
        }
      })
    })
  })

  describe('Complex JSON Structures', () => {
    it('handles real Gemini response structure', () => {
      const input =
        '{\n  "title": "Pin Title\nWith Newline",\n  "description": "Multi-line\ndescription\r\nhere\t",\n  "alt_text": "Alt text"\n}'
      const result = sanitizeJsonResponse(input)
      const parsed = JSON.parse(result)
      expect(parsed.title).toBe('Pin Title\nWith Newline')
      expect(parsed.description).toBe('Multi-line\ndescription\r\nhere\t')
      expect(parsed.alt_text).toBe('Alt text')
    })

    it('handles deeply nested structures with arrays', () => {
      const input =
        '{"data":{"items":[{"name":"Item\n1","desc":"Desc\t1"},{"name":"Item\r2"}]}}'
      const result = sanitizeJsonResponse(input)
      const parsed = JSON.parse(result)
      expect(parsed.data.items[0].name).toBe('Item\n1')
      expect(parsed.data.items[0].desc).toBe('Desc\t1')
      expect(parsed.data.items[1].name).toBe('Item\r2')
    })

    it('handles Unicode content with control chars', () => {
      const input = '{"text":"Hello 世界\nNew line 你好\ttab"}'
      const result = sanitizeJsonResponse(input)
      const parsed = JSON.parse(result)
      expect(parsed.text).toBe('Hello 世界\nNew line 你好\ttab')
    })

    it('handles mixed data types with control chars only in strings', () => {
      const input = '{"str":"a\nb","num":123,"bool":true,"null":null,"arr":[1,"x\ty",3]}'
      const result = sanitizeJsonResponse(input)
      const parsed = JSON.parse(result)
      expect(parsed.str).toBe('a\nb')
      expect(parsed.num).toBe(123)
      expect(parsed.bool).toBe(true)
      expect(parsed.null).toBe(null)
      expect(parsed.arr[1]).toBe('x\ty')
    })

    it('handles large string with multiple control characters', () => {
      const longContent = 'x'.repeat(1000) + '\n' + 'y'.repeat(1000) + '\t' + 'z'.repeat(1000)
      const input = `{"content":"${longContent}"}`
      const result = sanitizeJsonResponse(input)
      const parsed = JSON.parse(result)
      expect(parsed.content).toBe(longContent)
    })
  })

  describe('Edge Cases & Malformed Input', () => {
    it('handles plain text (no JSON structure)', () => {
      const input = 'just plain text\nwith newlines'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles input with no quotes', () => {
      const input = '{key:value}'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles unclosed string', () => {
      const input = '{"broken":"unclosed\n'
      const expected = '{"broken":"unclosed\\n'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles single quotes (not valid JSON)', () => {
      const input = "{'key':'value\n'}"
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles only quotes', () => {
      const input = '""'
      expect(sanitizeJsonResponse(input)).toBe(input)
    })

    it('handles quote followed immediately by control char', () => {
      const input = '{"key":"\nvalue"}'
      const expected = '{"key":"\\nvalue"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles control char followed immediately by closing quote', () => {
      const input = '{"key":"value\n"}'
      const expected = '{"key":"value\\n"}'
      expect(sanitizeJsonResponse(input)).toBe(expected)
    })

    it('handles very long string (performance check)', () => {
      const veryLong = 'x'.repeat(10000)
      const input = `{"long":"${veryLong}\n${veryLong}"}`
      const result = sanitizeJsonResponse(input)
      expect(result).toContain('\\n')
    })

    it('handles many small strings', () => {
      const pairs = Array.from({ length: 100 }, (_, i) => `"k${i}":"v${i}\n"`).join(',')
      const input = `{${pairs}}`
      const result = sanitizeJsonResponse(input)
      expect(result.match(/\\n/g)?.length).toBe(100)
    })
  })

  describe('JSON.parse Integration', () => {
    it('fixes actual parse failure (unescaped newline)', () => {
      const broken = '{"text":"line\nbreak"}'
      expect(() => JSON.parse(broken)).toThrow() // Confirm it's broken
      const fixed = sanitizeJsonResponse(broken)
      expect(() => JSON.parse(fixed)).not.toThrow() // Now it works
      const parsed = JSON.parse(fixed)
      expect(parsed.text).toBe('line\nbreak')
    })

    it('fixes multiple control characters', () => {
      const broken = '{"a":"x\n","b":"y\r\t","c":"z\f"}'
      expect(() => JSON.parse(broken)).toThrow()
      const fixed = sanitizeJsonResponse(broken)
      const parsed = JSON.parse(fixed)
      expect(parsed.a).toBe('x\n')
      expect(parsed.b).toBe('y\r\t')
      expect(parsed.c).toBe('z\f')
    })

    it('keeps already valid JSON parseable', () => {
      const valid = '{"title":"Test","value":123}'
      const result = sanitizeJsonResponse(valid)
      const parsed = JSON.parse(result)
      expect(parsed).toEqual({ title: 'Test', value: 123 })
    })

    it('handles complex real-world Gemini response', () => {
      const geminiResponse =
        '{\n  "title": "Blog Post\nTitle",\n  "description": "Multi-line\r\ndescription\twith tabs",\n  "alt_text": "Image\ndescription"\n}'
      const fixed = sanitizeJsonResponse(geminiResponse)
      const parsed = JSON.parse(fixed)
      expect(parsed.title).toBe('Blog Post\nTitle')
      expect(parsed.description).toBe('Multi-line\r\ndescription\twith tabs')
      expect(parsed.alt_text).toBe('Image\ndescription')
    })
  })

  describe('Unicode Edge Cases (U+2028, U+2029, BOM)', () => {
    it('escapes LINE SEPARATOR (U+2028) inside strings', () => {
      // U+2028 is valid JSON but breaks JavaScript string literals
      const input = '{"text":"line\u2028separator"}'
      const result = sanitizeJsonResponse(input)
      expect(result).toBe('{"text":"line\\u2028separator"}')
      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(parsed.text).toBe('line\u2028separator')
    })

    it('escapes PARAGRAPH SEPARATOR (U+2029) inside strings', () => {
      // U+2029 is valid JSON but breaks JavaScript string literals
      const input = '{"text":"para\u2029separator"}'
      const result = sanitizeJsonResponse(input)
      expect(result).toBe('{"text":"para\\u2029separator"}')
      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(parsed.text).toBe('para\u2029separator')
    })

    it('strips BOM (U+FEFF) from start of input', () => {
      const input = '\uFEFF{"text":"with BOM"}'
      const result = sanitizeJsonResponse(input)
      expect(result).toBe('{"text":"with BOM"}')
      expect(() => JSON.parse(result)).not.toThrow()
    })

    it('escapes DEL character (U+007F) inside strings', () => {
      const input = '{"text":"delete\x7Fchar"}'
      const result = sanitizeJsonResponse(input)
      expect(result).toBe('{"text":"delete\\u007fchar"}')
      expect(() => JSON.parse(result)).not.toThrow()
    })

    it('preserves emoji (surrogate pairs) inside strings', () => {
      const input = '{"text":"emoji 😀 here"}'
      const result = sanitizeJsonResponse(input)
      expect(result).toBe(input) // Emoji should be unchanged
      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(parsed.text).toBe('emoji 😀 here')
    })

    it('handles mixed Unicode separators and control chars', () => {
      const input = '{"text":"Line1\u2028Line2\nLine3\u2029Para2"}'
      const result = sanitizeJsonResponse(input)
      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(parsed.text).toBe('Line1\u2028Line2\nLine3\u2029Para2')
    })

    it('leaves LINE/PARAGRAPH SEPARATOR outside strings unchanged', () => {
      // These are whitespace outside strings
      const input = '{\u2028"text": "value"\u2029}'
      const result = sanitizeJsonResponse(input)
      expect(result).toBe(input)
    })

    it('handles real-world failure at position 282', () => {
      // Simulate the exact structure that failed in production
      // Position 282 is likely in the middle of the description field
      const title = 'x'.repeat(100)
      const descPrefix = 'y'.repeat(140)
      const input = `{\n  "title": "${title}",\n  "description": "${descPrefix}\u2028This line separator caused the failure",\n  "alt_text": "Alt text"\n}`

      const result = sanitizeJsonResponse(input)
      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(parsed.description).toContain('\u2028')
    })
  })
})
