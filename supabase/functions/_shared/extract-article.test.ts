import {
  ARTICLE_WITH_JSON_LD_DATE_ONLY,
  ARTICLE_WITH_TIME_ELEMENT_ONLY,
  PAGE_WITHOUT_ARTICLE,
  WORDPRESS_ARTICLE_WITH_META_DATE,
} from '@/test/fixtures/article-pages'
import { extractArticle, htmlToMarkdown, NoArticleFoundError } from './extract-article.ts'
import { parsePublishedAt } from './published-at.ts'

// Readability-based extraction (ADR-0008). The real linkedom, Readability and
// Turndown packages run here via the `npm:` aliases in vitest.config.ts.

describe('extractArticle()', () => {
  describe('WordPress post with navigation, sidebar, footer and cookie banner', () => {
    const article = extractArticle(
      WORDPRESS_ARTICLE_WITH_META_DATE,
      'https://schlafgut.example/abendrituale/',
    )

    it('uses the <h1> as title, without the site name', () => {
      expect(article.title).toBe('5 Abendrituale für besseren Schlaf')
    })

    it('keeps the article body', () => {
      expect(article.content).toContain('Wer abends nicht abschalten kann')
      expect(article.content).toContain('Licht spielt eine größere Rolle')
    })

    it('keeps headings, lists, emphasis and links as Markdown', () => {
      expect(article.content).toMatch(/^## 1\. Ein fester Rhythmus$/m)
      expect(article.content).toMatch(/^### Was konkret hilft$/m)
      expect(article.content).toMatch(/^- +\*\*Warmes Licht\*\* ab 20 Uhr$/m)
      expect(article.content).toMatch(/^1\. +Licht dimmen$/m)
      expect(article.content).toContain('*anderen*')
      // Relative links are resolved against the article URL
      expect(article.content).toContain(
        '[Artikel über den Schlafrhythmus](https://schlafgut.example/schlafrhythmus-finden/)',
      )
    })

    it('drops navigation, sidebar, footer, cookie banner, scripts and images', () => {
      for (const noise of [
        'Startseite',
        'Neueste Beiträge',
        'Newsletter',
        'Cookies',
        'Alle akzeptieren',
        'Impressum',
        'dataLayer',
        'schlaf.jpg',
      ]) {
        expect(article.content).not.toContain(noise)
      }
    })

    it('reads the publication date', () => {
      expect(parsePublishedAt(article.published_at)).toBe('2025-03-04T08:15:00.000Z')
    })
  })

  it('falls back to JSON-LD datePublished (inside @graph) when no meta tag exists', () => {
    const article = extractArticle(ARTICLE_WITH_JSON_LD_DATE_ONLY, 'https://schlafgut.example/tee/')

    expect(article.title).toBe('Tee-Rezepte zum Einschlafen')
    expect(article.content).toMatch(/^## Lavendel und Melisse$/m)
    expect(parsePublishedAt(article.published_at)).toBe('2024-11-20T05:00:00.000Z')
  })

  it('falls back to <time datetime> when neither meta tag nor JSON-LD exists', () => {
    const article = extractArticle(
      ARTICLE_WITH_TIME_ELEMENT_ONLY,
      'https://schlafgut.example/mittagsschlaf/',
    )

    expect(article.title).toBe('Mittagsschlaf richtig machen')
    expect(parsePublishedAt(article.published_at)).toBe('2023-07-09T00:00:00.000Z')
  })

  it('returns null as date when the page carries none', () => {
    const html = ARTICLE_WITH_TIME_ELEMENT_ONLY.replace(/<time[^>]*>[^<]*<\/time>/, '')
    expect(extractArticle(html, 'https://schlafgut.example/x/').published_at).toBeNull()
  })

  it('throws NoArticleFoundError for a page without an article', () => {
    expect(() =>
      extractArticle(PAGE_WITHOUT_ARTICLE, 'https://schlafgut.example/kategorie/schlaf/'),
    ).toThrow(NoArticleFoundError)
    expect(() =>
      extractArticle(PAGE_WITHOUT_ARTICLE, 'https://schlafgut.example/kategorie/schlaf/'),
    ).toThrow(/No readable article found at https:\/\/schlafgut\.example\/kategorie\/schlaf\//)
  })

  it('throws NoArticleFoundError for an empty document', () => {
    expect(() => extractArticle('', 'https://schlafgut.example/leer/')).toThrow(NoArticleFoundError)
  })
})

describe('htmlToMarkdown()', () => {
  it('converts headings, paragraphs, lists, links and emphasis', () => {
    const markdown = htmlToMarkdown(
      '<h2>Titel</h2><p>Text mit <a href="https://a.example/">Link</a>, <strong>fett</strong> und <em>kursiv</em>.</p><ul><li>eins</li><li>zwei</li></ul>',
    )

    expect(markdown).toMatch(/^## Titel$/m)
    expect(markdown).toContain('[Link](https://a.example/)')
    expect(markdown).toContain('**fett**')
    expect(markdown).toContain('*kursiv*')
    expect(markdown).toMatch(/^- +eins$/m)
  })
})
