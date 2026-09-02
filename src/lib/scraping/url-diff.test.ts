import { filterNewUrls, diffSitemapEntries } from './url-diff'

describe('filterNewUrls()', () => {
  it('treats a slash-less sitemap URL as known when the DB stores it with a trailing slash', () => {
    const discovered = ['https://himmelstraenen.de/artikel-a']
    const existing = ['https://himmelstraenen.de/artikel-a/']

    expect(filterNewUrls(discovered, existing)).toEqual([])
  })

  it('treats a slashed sitemap URL as known when the DB stores it without a slash', () => {
    expect(
      filterNewUrls(
        ['https://onlineheldinnen.de/artikel-b/'],
        ['https://onlineheldinnen.de/artikel-b'],
      ),
    ).toEqual([])
  })

  it('still reports genuinely new URLs, normalized', () => {
    expect(
      filterNewUrls(
        ['https://blog.test/neu/', 'https://blog.test/alt/'],
        ['https://blog.test/alt'],
      ),
    ).toEqual(['https://blog.test/neu'])
  })

  it('emits a URL once when the sitemap lists both slash variants', () => {
    expect(
      filterNewUrls(['https://blog.test/neu', 'https://blog.test/neu/'], []),
    ).toEqual(['https://blog.test/neu'])
  })

  it('matches regardless of which side carries the slash', () => {
    const discovered = ['https://blog.test/a/', 'https://blog.test/b']
    const existing = ['https://blog.test/a', 'https://blog.test/b/']

    expect(filterNewUrls(discovered, existing)).toEqual([])
  })
})

describe('diffSitemapEntries()', () => {
  it('does not queue the same article twice when both slash variants appear', () => {
    const result = diffSitemapEntries(
      [{ url: 'https://blog.test/neu' }, { url: 'https://blog.test/neu/' }],
      [],
    )

    expect(result).toEqual([{ url: 'https://blog.test/neu', reason: 'new' }])
  })

  it('prefers the existing row with the newest scraped_at when the DB holds both variants', () => {
    const result = diffSitemapEntries(
      [{ url: 'https://blog.test/a', lastmod: '2026-08-05T00:00:00Z' }],
      [
        { url: 'https://blog.test/a/', scraped_at: '2026-07-01T00:00:00Z' },
        { url: 'https://blog.test/a', scraped_at: '2026-08-09T00:00:00Z' },
      ],
    )

    expect(result).toEqual([])
  })

  it('does not re-scrape existing articles when only the trailing slash differs', () => {
    const result = diffSitemapEntries(
      [{ url: 'https://himmelstraenen.de/artikel-a' }],
      [{ url: 'https://himmelstraenen.de/artikel-a/', scraped_at: '2026-07-04T06:00:00Z' }],
    )

    expect(result).toEqual([])
  })

  it('marks an article as updated when lastmod is newer than scraped_at', () => {
    expect(
      diffSitemapEntries(
        [{ url: 'https://blog.test/a/', lastmod: '2026-08-02T00:00:00Z' }],
        [{ url: 'https://blog.test/a', scraped_at: '2026-08-01T00:00:00Z' }],
      ),
    ).toEqual([{ url: 'https://blog.test/a', reason: 'updated' }])
  })

  it('marks unknown URLs as new', () => {
    expect(
      diffSitemapEntries([{ url: 'https://blog.test/neu' }], []),
    ).toEqual([{ url: 'https://blog.test/neu', reason: 'new' }])
  })
})
