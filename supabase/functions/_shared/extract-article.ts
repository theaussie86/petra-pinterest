// linkedom and Readability are typed against the DOM lib, which Deno does not
// load by default.
/// <reference lib="dom" />
/**
 * Article extraction without AI (ADR-0008): parse the fetched HTML into a DOM
 * with linkedom (the Edge runtime has no DOMParser), let Mozilla Readability
 * find the main content, convert it to Markdown with Turndown and pick the
 * publication date from Readability or the page metadata.
 *
 * Imports use Deno `npm:` specifiers with a pinned major; vitest aliases map
 * them onto the installed Node packages so the module runs under tests too.
 */
import { parseHTML } from 'npm:linkedom@0.18'
import { Readability } from 'npm:@mozilla/readability@0.6'
import TurndownService from 'npm:turndown@7'

/** Less visible text than this is a teaser, a listing or an error page. */
export const MIN_ARTICLE_TEXT_LENGTH = 250

/**
 * Readability found no usable article on the page (null result or too little
 * text). Thrown instead of upserting an empty article.
 */
export class NoArticleFoundError extends Error {
  constructor(url: string, detail: string) {
    super(`No readable article found at ${url}: ${detail}`)
    this.name = 'NoArticleFoundError'
  }
}

export interface ExtractedArticle {
  title: string
  /** Article body as Markdown (headings, lists, links, emphasis kept). */
  content: string
  /** Raw date string as found on the page; run it through `parsePublishedAt`. */
  published_at: string | null
}

// Elements that carry no article text worth keeping in Markdown.
const DROPPED_ELEMENTS = [
  'img',
  'picture',
  'figure',
  'video',
  'audio',
  'iframe',
  'svg',
  'form',
  'button',
  'script',
  'style',
  'noscript',
] as const

function createTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  })
  // `remove` is typed for HTML tag names; the list above is plain tag names.
  turndown.remove(DROPPED_ELEMENTS as unknown as TurndownService.Filter)
  return turndown
}

/** Convert Readability's article HTML into Markdown. */
export function htmlToMarkdown(html: string): string {
  return createTurndown()
    .turndown(html)
    // Turndown escapes "1." everywhere to stop list parsing; inside a heading
    // it cannot start a list, so keep numbered headings readable.
    .replace(/^(#{1,6} \d+)\\\./gm, '$1.')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// --- Publication date fallbacks -------------------------------------------

const DATE_META_SELECTORS = [
  'meta[property="article:published_time"]',
  'meta[name="article:published_time"]',
  'meta[property="og:published_time"]',
  'meta[itemprop="datePublished"]',
  'meta[name="date"]',
  'meta[name="publish-date"]',
  'meta[name="pubdate"]',
  'meta[name="DC.date.issued"]',
]

type ParsedDocument = ReturnType<typeof parseHTML>['document']

function dateFromMeta(document: ParsedDocument): string | null {
  for (const selector of DATE_META_SELECTORS) {
    const value = document.querySelector(selector)?.getAttribute('content')?.trim()
    if (value) return value
  }
  return null
}

/** Depth-first search for `datePublished` in a JSON-LD value (incl. `@graph`). */
function findDatePublished(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findDatePublished(item)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.datePublished === 'string' && record.datePublished.trim()) {
      return record.datePublished.trim()
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        const found = findDatePublished(value)
        if (found) return found
      }
    }
  }
  return null
}

function dateFromJsonLd(document: ParsedDocument): string | null {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const found = findDatePublished(JSON.parse(script.textContent ?? ''))
      if (found) return found
    } catch {
      // Broken JSON-LD is common; ignore it and try the next block.
    }
  }
  return null
}

function dateFromTimeElement(document: ParsedDocument): string | null {
  const time =
    document.querySelector('article time[datetime]') ?? document.querySelector('time[datetime]')
  return time?.getAttribute('datetime')?.trim() || null
}

/** Readability's title can still carry the site name; prefer a matching single <h1>. */
function pickTitle(readabilityTitle: string | null | undefined, h1Texts: string[]): string {
  const title = (readabilityTitle ?? '').trim()
  if (h1Texts.length === 1) {
    const h1 = h1Texts[0]
    if (h1 && (!title || (title !== h1 && title.includes(h1)))) return h1
  }
  return title
}

/**
 * Extract title, Markdown content and raw publication date from an article
 * page. Throws `NoArticleFoundError` when the page holds no readable article.
 */
export function extractArticle(html: string, url: string): ExtractedArticle {
  const { document } = parseHTML(html)
  if (!document.documentElement || !document.body) {
    throw new NoArticleFoundError(url, 'empty or unparseable HTML')
  }

  // Readability resolves relative links against the document base; linkedom
  // has no URL of its own, so give it one.
  if (!document.querySelector('base[href]')) {
    const base = document.createElement('base')
    base.setAttribute('href', url)
    document.head?.prepend(base)
  }

  // Read the metadata before Readability mutates the document (it strips
  // scripts, so JSON-LD would be gone afterwards).
  const fallbackDate =
    dateFromMeta(document) ?? dateFromJsonLd(document) ?? dateFromTimeElement(document)
  const h1Texts = [...document.querySelectorAll('h1')]
    .map((h1) => (h1.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  // linkedom's Document is not the lib.dom type, but implements what
  // Readability uses.
  let parsed: ReturnType<Readability['parse']>
  try {
    parsed = new Readability(document as unknown as Document).parse()
  } catch (error) {
    throw new NoArticleFoundError(url, `Readability failed: ${(error as Error).message}`)
  }

  if (!parsed || !parsed.content) {
    throw new NoArticleFoundError(url, 'Readability returned no content')
  }

  const textLength = (parsed.textContent ?? '').replace(/\s+/g, ' ').trim().length
  if (textLength < MIN_ARTICLE_TEXT_LENGTH) {
    throw new NoArticleFoundError(
      url,
      `only ${textLength} characters of text (minimum ${MIN_ARTICLE_TEXT_LENGTH})`,
    )
  }

  const title = pickTitle(parsed.title, h1Texts)
  if (!title) {
    throw new NoArticleFoundError(url, 'no title found')
  }

  return {
    title,
    content: htmlToMarkdown(parsed.content),
    published_at: parsed.publishedTime?.trim() || fallbackDate,
  }
}
