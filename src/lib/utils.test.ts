import { cn, sanitizeHtml, normalizeUrl } from './utils'

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'end')).toBe('base end')
  })

  it('resolves Tailwind conflicts (last wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('handles undefined and null inputs', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('merges array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })
})

describe('sanitizeHtml()', () => {
  it('removes script tags and their content', () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    expect(sanitizeHtml(input)).toBe('<p>Hello</p><p>World</p>')
  })

  it('removes style tags and their content', () => {
    const input = '<p>Hello</p><style>.evil { display:none }</style>'
    expect(sanitizeHtml(input)).toBe('<p>Hello</p>')
  })

  it('removes iframe tags', () => {
    const input = '<p>Before</p><iframe src="evil.com">content</iframe><p>After</p>'
    expect(sanitizeHtml(input)).toBe('<p>Before</p><p>After</p>')
  })

  it('removes object and embed tags', () => {
    const input = '<object data="evil.swf">inner</object><embed src="evil.swf">inner</embed>'
    expect(sanitizeHtml(input)).toBe('')
  })

  it('removes event handler attributes', () => {
    const input = '<img src="pic.jpg" onerror="alert(1)" />'
    expect(sanitizeHtml(input)).toBe('<img src="pic.jpg" />')
  })

  it('removes onclick handlers', () => {
    const input = '<a href="#" onclick="evil()">Click</a>'
    expect(sanitizeHtml(input)).toBe('<a href="#">Click</a>')
  })

  it('removes javascript: URLs', () => {
    const input = '<a href="javascript:alert(1)">Link</a>'
    expect(sanitizeHtml(input)).not.toContain('javascript:')
    expect(sanitizeHtml(input)).toContain('>Link</a>')
  })

  it('preserves safe HTML', () => {
    const input = '<h1>Title</h1><p>Paragraph with <a href="https://example.com">link</a></p>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it('handles nested dangerous tags', () => {
    const input = '<script type="text/javascript">var x = "<script>nested</script>";</script>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<script')
  })
})

describe('normalizeUrl()', () => {
  it('strips a single trailing slash', () => {
    expect(normalizeUrl('https://blog.test/artikel/')).toBe('https://blog.test/artikel')
  })

  it('leaves a slash-less URL untouched', () => {
    expect(normalizeUrl('https://blog.test/artikel')).toBe('https://blog.test/artikel')
  })

  it('is idempotent', () => {
    const once = normalizeUrl('https://blog.test/artikel/')
    expect(normalizeUrl(once)).toBe(once)
  })

  it('collapses repeated trailing slashes', () => {
    expect(normalizeUrl('https://blog.test/artikel///')).toBe('https://blog.test/artikel')
  })

  it('keeps the root path so the origin stays a valid URL', () => {
    expect(normalizeUrl('https://blog.test/')).toBe('https://blog.test/')
    expect(normalizeUrl('https://blog.test')).toBe('https://blog.test/')
  })

  it('preserves the query string and strips only the path slash', () => {
    expect(normalizeUrl('https://blog.test/artikel/?utm_source=pinterest')).toBe(
      'https://blog.test/artikel?utm_source=pinterest',
    )
  })

  it('drops the fragment', () => {
    expect(normalizeUrl('https://blog.test/artikel/#intro')).toBe('https://blog.test/artikel')
  })

  it('lowercases the host but not the path', () => {
    expect(normalizeUrl('https://Blog.TEST/Artikel/')).toBe('https://blog.test/Artikel')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://blog.test/artikel/  ')).toBe('https://blog.test/artikel')
  })

  it('does not touch the scheme', () => {
    expect(normalizeUrl('http://blog.test/artikel/')).toBe('http://blog.test/artikel')
  })

  it('keeps umlaut paths readable rather than double-encoding them', () => {
    expect(normalizeUrl('https://blog.test/für-anfänger/')).toBe(
      normalizeUrl('https://blog.test/für-anfänger'),
    )
  })

  it('falls back to a trailing-slash strip for non-absolute input', () => {
    expect(normalizeUrl('/artikel/')).toBe('/artikel')
    expect(normalizeUrl('/')).toBe('/')
  })

  it('maps both slash variants onto the same key in either direction', () => {
    const withSlash = 'https://himmelstraenen.de/artikel-a/'
    const without = 'https://himmelstraenen.de/artikel-a'
    expect(normalizeUrl(withSlash)).toBe(normalizeUrl(without))
  })
})
