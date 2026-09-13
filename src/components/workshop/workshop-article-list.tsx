import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Article } from '@/types/articles'

/**
 * Case-insensitive title search over the article list. Extracted so the filter
 * behaviour is unit-testable without rendering the component.
 */
export function filterArticlesBySearch(articles: Article[], search: string): Article[] {
  const term = search.trim().toLowerCase()
  if (!term) return articles
  return articles.filter((a) => a.title.toLowerCase().includes(term))
}

interface WorkshopArticleListProps {
  articles: Article[]
  counts: Record<string, number>
  selectedArticleId: string | null
  onSelect: (articleId: string) => void
}

export function WorkshopArticleList({
  articles,
  counts,
  selectedArticleId,
  onSelect,
}: WorkshopArticleListProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const filtered = filterArticlesBySearch(articles, search)

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {t('workshop.articlesHeading')}
      </h2>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('workshop.searchPlaceholder')}
          className="pl-8"
          aria-label={t('workshop.searchPlaceholder')}
        />
      </div>

      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('workshop.noArticles')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('workshop.noArticlesMatch')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map((article) => {
            const count = counts[article.id] ?? 0
            const isSelected = article.id === selectedArticleId
            return (
              <li key={article.id}>
                <button
                  type="button"
                  onClick={() => onSelect(article.id)}
                  className={cn(
                    'w-full text-left rounded-md px-3 py-2 text-sm transition-colors',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">{article.title}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {t('workshop.templateCount', { count })}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
