import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleCheck, Clock, Search, Undo2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { WorkspaceCounts } from '@/lib/pin-template-workspace'
import type { Article, ArticleWorkshopStatus } from '@/types/articles'

/**
 * Case-insensitive title search over the article list. Extracted so the filter
 * behaviour is unit-testable without rendering the component.
 */
export function filterArticlesBySearch(articles: Article[], search: string): Article[] {
  const term = search.trim().toLowerCase()
  if (!term) return articles
  return articles.filter((a) => a.title.toLowerCase().includes(term))
}

/** The left-column segments: curated for pins, still to decide, left out. */
export const ARTICLE_SEGMENTS = ['wanted', 'undecided', 'excluded'] as const
export type ArticleSegment = (typeof ARTICLE_SEGMENTS)[number]

function totalOf(counts: WorkspaceCounts | undefined): number {
  return counts ? counts.open + counts.approved + counts.archived : 0
}

/**
 * The segment an article belongs to. An article that already has templates
 * counts as wanted whatever its stored status, so templates never hide.
 */
export function segmentOf(article: Article, counts: Record<string, WorkspaceCounts>): ArticleSegment {
  if (article.workshop_status === 'wanted' || totalOf(counts[article.id]) > 0) return 'wanted'
  if (article.workshop_status === 'excluded') return 'excluded'
  return 'undecided'
}

/**
 * Articles of one segment in working order. Wanted: open review work first,
 * then those waiting for the agent, then finished ones. The other segments keep
 * the incoming order (newest article first).
 */
export function articlesInSegment(
  articles: Article[],
  counts: Record<string, WorkspaceCounts>,
  segment: ArticleSegment,
): Article[] {
  const inSegment = articles.filter((a) => segmentOf(a, counts) === segment)
  if (segment !== 'wanted') return inSegment
  const rank = (a: Article) => {
    const c = counts[a.id]
    if (c && c.open > 0) return 0
    if (totalOf(c) === 0) return 1
    return 2
  }
  return inSegment
    .map((a, i) => ({ a, i, r: rank(a) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(({ a }) => a)
}

/** Article count per segment for the segment switch. */
export function countBySegment(
  articles: Article[],
  counts: Record<string, WorkspaceCounts>,
): Record<ArticleSegment, number> {
  const result: Record<ArticleSegment, number> = { wanted: 0, undecided: 0, excluded: 0 }
  for (const a of articles) result[segmentOf(a, counts)] += 1
  return result
}

/**
 * Where the Werkstatt opens: the wanted segment when it has articles (first
 * article with open review work), else the articles still to decide.
 */
export function defaultWorkshopSelection(
  articles: Article[],
  counts: Record<string, WorkspaceCounts>,
): { segment: ArticleSegment; articleId: string | null } {
  for (const segment of ['wanted', 'undecided'] as const) {
    const list = articlesInSegment(articles, counts, segment)
    if (list.length > 0) return { segment, articleId: list[0].id }
  }
  return { segment: 'wanted', articleId: null }
}

interface WorkshopArticleListProps {
  articles: Article[]
  counts: Record<string, WorkspaceCounts>
  segment: ArticleSegment
  onSegmentChange: (segment: ArticleSegment) => void
  selectedArticleId: string | null
  onSelect: (articleId: string) => void
  /** Curate an article straight from its row (no note). */
  onCurate: (articleId: string, status: ArticleWorkshopStatus | null) => void
}

export function WorkshopArticleList({
  articles,
  counts,
  segment,
  onSegmentChange,
  selectedArticleId,
  onSelect,
  onCurate,
}: WorkshopArticleListProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const segmentCounts = countBySegment(articles, counts)
  const visible = filterArticlesBySearch(articlesInSegment(articles, counts, segment), search)

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <h2 className="font-display text-sm font-bold">{t('workshop.articlesHeading')}</h2>

      <div
        role="tablist"
        aria-label={t('workshop.articlesHeading')}
        className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {ARTICLE_SEGMENTS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={segment === s}
            onClick={() => onSegmentChange(s)}
            className={cn(
              'flex flex-col items-center rounded-md px-1 py-1 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              segment === s
                ? 'bg-white font-medium text-primary shadow-[0_1px_3px_rgba(75,31,166,0.15)] dark:bg-white/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{t(`workshop.segments.${s}`)}</span>
            <span className="tabular-nums opacity-70">{segmentCounts[s]}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('workshop.searchPlaceholder')}
          className="pl-8"
          aria-label={t('workshop.searchPlaceholder')}
        />
      </div>

      {articles.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t('workshop.noArticles')}</p>
      ) : visible.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {search.trim() ? t('workshop.noArticlesMatch') : t(`workshop.segmentEmpty.${segment}`)}
        </p>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
          {visible.map((article) => (
            <li key={article.id}>
              <ArticleRow
                article={article}
                counts={counts[article.id]}
                segment={segment}
                isSelected={article.id === selectedArticleId}
                onSelect={() => onSelect(article.id)}
                onCurate={(status) => onCurate(article.id, status)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ArticleRow({
  article,
  counts,
  segment,
  isSelected,
  onSelect,
  onCurate,
}: {
  article: Article
  counts: WorkspaceCounts | undefined
  segment: ArticleSegment
  isSelected: boolean
  onSelect: () => void
  onCurate: (status: ArticleWorkshopStatus | null) => void
}) {
  const { t } = useTranslation()
  const total = totalOf(counts)

  return (
    <div
      className={cn(
        'group flex items-start gap-1 rounded-lg transition-colors',
        'hover:bg-sidebar-accent/60',
        isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? 'true' : undefined}
        className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'line-clamp-2 text-sm leading-snug',
            isSelected && 'font-medium',
            segment === 'excluded' && 'text-muted-foreground',
          )}
        >
          {article.title}
        </span>
        {segment === 'wanted' && <WantedProgress counts={counts} total={total} />}
      </button>

      {segment === 'undecided' && (
        <span className="flex shrink-0 gap-0.5 py-2 pr-1.5">
          <RowAction
            label={t('workshop.curate.want')}
            onClick={() => onCurate('wanted')}
            className="hover:bg-emerald-100 hover:text-emerald-800 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
          >
            <Check className="h-4 w-4" />
          </RowAction>
          <RowAction
            label={t('workshop.curate.exclude')}
            onClick={() => onCurate('excluded')}
            className="hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </RowAction>
        </span>
      )}
      {segment === 'excluded' && (
        <span className="flex shrink-0 py-2 pr-1.5">
          <RowAction
            label={t('workshop.curate.reset')}
            onClick={() => onCurate(null)}
            className="hover:bg-muted hover:text-foreground"
          >
            <Undo2 className="h-4 w-4" />
          </RowAction>
        </span>
      )}
    </div>
  )
}

function RowAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Review progress of a wanted article, or that it still waits for the agent. */
function WantedProgress({ counts, total }: { counts: WorkspaceCounts | undefined; total: number }) {
  const { t } = useTranslation()

  if (!counts || total === 0) {
    return (
      <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {t('workshop.waitingForAgent')}
      </span>
    )
  }

  const done = counts.open === 0
  return (
    <span className="mt-2 flex items-center gap-2">
      <span
        className="h-1 flex-1 overflow-hidden rounded-full bg-primary/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={counts.approved}
        aria-label={t('workshop.progress', { approved: counts.approved, total })}
      >
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${(counts.approved / total) * 100}%` }}
        />
      </span>
      {done ? (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="h-3.5 w-3.5" />
          {t('workshop.articleDone')}
        </span>
      ) : (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {t('workshop.openCount', { count: counts.open })}
        </span>
      )}
    </span>
  )
}
