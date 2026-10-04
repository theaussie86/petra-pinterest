import {
  filterArticlesBySearch,
  segmentOf,
  articlesInSegment,
  countBySegment,
  defaultWorkshopSelection,
} from './workshop-article-list'
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

describe('article segments', () => {
  const counts = {
    done: { open: 0, approved: 28, archived: 2 },
    open: { open: 5, approved: 25, archived: 0 },
  }
  const articles = [
    buildArticle({ id: 'new', title: 'Neu' }),
    buildArticle({ id: 'waiting', workshop_status: 'wanted' }),
    buildArticle({ id: 'done', workshop_status: 'wanted' }),
    buildArticle({ id: 'open', workshop_status: null }),
    buildArticle({ id: 'out', workshop_status: 'excluded' }),
  ]

  it('treats articles with templates as wanted, whatever their stored status', () => {
    expect(segmentOf(articles[3], counts)).toBe('wanted')
    expect(segmentOf(articles[0], counts)).toBe('undecided')
    expect(segmentOf(articles[4], counts)).toBe('excluded')
  })

  it('orders wanted articles: open work, waiting for the agent, finished', () => {
    expect(articlesInSegment(articles, counts, 'wanted').map((a) => a.id)).toEqual([
      'open',
      'waiting',
      'done',
    ])
  })

  it('counts articles per segment', () => {
    expect(countBySegment(articles, counts)).toEqual({ wanted: 3, undecided: 1, excluded: 1 })
  })

  it('opens on the first wanted article, else on the undecided ones', () => {
    expect(defaultWorkshopSelection(articles, counts)).toEqual({ segment: 'wanted', articleId: 'open' })
    expect(defaultWorkshopSelection([articles[0], articles[4]], {})).toEqual({
      segment: 'undecided',
      articleId: 'new',
    })
    expect(defaultWorkshopSelection([], {})).toEqual({ segment: 'wanted', articleId: null })
  })
})
