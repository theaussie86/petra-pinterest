import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import type { Article, ArticleSortField } from '@/types/articles'

interface ArticleDataTableProps {
  articles: Article[]
  sortField: ArticleSortField
  sortDirection: 'asc' | 'desc'
  onSort: (field: ArticleSortField) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  pinCountByArticle: Record<string, number>
  isArchived?: boolean
  renderTitleCell: (article: Article) => ReactNode
  renderPinCountCell: (article: Article) => ReactNode
  renderUrlCell: (article: Article) => ReactNode
  renderActionsCell: (article: Article) => ReactNode
  formatDate: (dateString: string | null) => string
}

export function ArticleDataTable({
  articles,
  sortField,
  sortDirection,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  pinCountByArticle,
  isArchived = false,
  renderTitleCell,
  renderPinCountCell,
  renderUrlCell,
  renderActionsCell,
  formatDate,
}: ArticleDataTableProps) {
  const { t } = useTranslation()

  // Sort articles
  const sortedArticles = useMemo(() => {
    return [...articles].sort((a, b) => {
      let aValue: string | number | null = null
      let bValue: string | number | null = null

      switch (sortField) {
        case 'title':
          aValue = a.title
          bValue = b.title
          break
        case 'published_at':
          aValue = a.published_at || ''
          bValue = b.published_at || ''
          break
        case 'url':
          aValue = a.url
          bValue = b.url
          break
        case 'pin_count':
          aValue = pinCountByArticle[a.id] || 0
          bValue = pinCountByArticle[b.id] || 0
          break
      }

      if (aValue === null || aValue === '') return 1
      if (bValue === null || bValue === '') return -1

      const comparison = aValue > bValue ? 1 : -1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [articles, sortField, sortDirection, pinCountByArticle])

  const allSelected = sortedArticles.length > 0 && selectedIds.size === sortedArticles.length

  const getSortIcon = (field: ArticleSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 inline" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3 inline" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 inline" />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleSelectAll}
              aria-label={t('articlesTable.selectAll')}
            />
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => onSort('title')}>
            {t('articlesTable.columnTitle')} {getSortIcon('title')}
          </TableHead>
          <TableHead className="cursor-pointer w-[140px]" onClick={() => onSort('published_at')}>
            {t('articlesTable.columnDate')} {getSortIcon('published_at')}
          </TableHead>
          <TableHead className="cursor-pointer w-[100px]" onClick={() => onSort('pin_count')}>
            {t('articlesTable.columnPinCount')} {getSortIcon('pin_count')}
          </TableHead>
          <TableHead className="cursor-pointer w-[200px]" onClick={() => onSort('url')}>
            {t('articlesTable.columnUrl')} {getSortIcon('url')}
          </TableHead>
          {isArchived && (
            <TableHead className="w-[140px]">{t('articlesTable.columnArchivedOn')}</TableHead>
          )}
          <TableHead className="w-[120px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedArticles.map((article) => (
          <TableRow
            key={article.id}
            data-state={selectedIds.has(article.id) ? 'selected' : undefined}
          >
            <TableCell>
              <Checkbox
                checked={selectedIds.has(article.id)}
                onCheckedChange={() => onToggleSelect(article.id)}
                aria-label={`Select ${article.title}`}
              />
            </TableCell>
            <TableCell className="font-medium">
              {renderTitleCell(article)}
            </TableCell>
            <TableCell>
              {formatDate(article.published_at || article.scraped_at)}
            </TableCell>
            <TableCell>
              {renderPinCountCell(article)}
            </TableCell>
            <TableCell>
              {renderUrlCell(article)}
            </TableCell>
            {isArchived && (
              <TableCell className="text-sm text-slate-500">
                {formatDate(article.archived_at)}
              </TableCell>
            )}
            <TableCell>
              {renderActionsCell(article)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
