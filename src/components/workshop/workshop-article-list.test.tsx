import { filterArticlesBySearch } from './workshop-article-list'
import { buildArticle } from '@/test/factories'

describe('filterArticlesBySearch', () => {
  const articles = [
    buildArticle({ id: 'a1', title: 'Cozy Winter Recipes' }),
    buildArticle({ id: 'a2', title: 'Summer Garden Tips' }),
    buildArticle({ id: 'a3', title: 'Winter Fashion Guide' }),
  ]

  it('returns all articles when the search term is empty or whitespace', () => {
    expect(filterArticlesBySearch(articles, '')).toEqual(articles)
    expect(filterArticlesBySearch(articles, '   ')).toEqual(articles)
  })

  it('matches titles case-insensitively', () => {
    const result = filterArticlesBySearch(articles, 'winter')
    expect(result.map((a) => a.id)).toEqual(['a1', 'a3'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterArticlesBySearch(articles, 'nonexistent')).toEqual([])
  })
})
