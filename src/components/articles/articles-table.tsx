import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowUp, ArrowDown, ArrowUpDown, ExternalLink } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useArticles, useArchivedArticles, useArchiveArticle, useRestoreArticle } from '@/lib/hooks/use-articles'
import type { Article } from '@/types/articles'
import type { ArticleSortField, SortDirection } from '@/types/articles'

interface ArticlesTableProps {
  projectId: string
}

export function ArticlesTable({ projectId }: ArticlesTableProps) {
  const { t, i18n } = useTranslation()
  const [sortField, setSortField] = useState<ArticleSortField>('published_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  const { data: articles, isLoading, error } = useArticles(projectId)
  const { data: archivedArticles, isLoading: archivedLoading, error: archivedError } = useArchivedArticles(projectId)

  const archiveMutation = useArchiveArticle()
  const restoreMutation = useRestoreArticle()

  const handleSort = (field: ArticleSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

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

  const sortArticles = (articlesToSort: Article[] | undefined) => {
    if (!articlesToSort) return []

    return [...articlesToSort].sort((a, b) => {
      let aValue: string | number | null = null
      let bValue: string | number | null = null

      if (sortField === 'title') {
        aValue = a.title
        bValue = b.title
      } else if (sortField === 'published_at') {
        aValue = a.published_at || ''
        bValue = b.published_at || ''
      } else if (sortField === 'url') {
        aValue = a.url
        bValue = b.url
      }

      if (aValue === null || aValue === '') return 1
      if (bValue === null || bValue === '') return -1

      const comparison = aValue > bValue ? 1 : -1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('articlesTable.noDate')
    return new Date(dateString).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getDomainFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch {
      return url
    }
  }

  const handleArchive = async (articleId: string) => {
    await archiveMutation.mutateAsync(articleId)
  }

  const handleRestore = async (articleId: string) => {
    await restoreMutation.mutateAsync(articleId)
  }

  const renderTableContent = (data: Article[] | undefined, loading: boolean, err: Error | null, isArchived: boolean) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        </div>
      )
    }

    if (err) {
      return (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <p className="text-red-600">{t('articlesTable.errorLoadFailed')}</p>
          <Button onClick={() => window.location.reload()} variant="outline" size="sm">
            {t('common.retry')}
          </Button>
        </div>
      )
    }

    if (!data || data.length === 0) {
      return (
        <div className="flex items-center justify-center py-8">
          <p className="text-slate-500 text-sm">
            {isArchived ? t('articlesTable.emptyArchived') : t('articlesTable.emptyActive')}
          </p>
        </div>
      )
    }

    const sortedArticles = sortArticles(data)

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer" onClick={() => handleSort('title')}>
              {t('articlesTable.columnTitle')} {getSortIcon('title')}
            </TableHead>
            <TableHead className="cursor-pointer w-[140px]" onClick={() => handleSort('published_at')}>
              {t('articlesTable.columnDate')} {getSortIcon('published_at')}
            </TableHead>
            <TableHead className="w-[100px]">{t('articlesTable.columnPinCount')}</TableHead>
            <TableHead className="cursor-pointer w-[200px]" onClick={() => handleSort('url')}>
              {t('articlesTable.columnUrl')} {getSortIcon('url')}
            </TableHead>
            {isArchived && <TableHead className="w-[140px]">{t('articlesTable.columnArchivedOn')}</TableHead>}
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedArticles.map((article) => (
            <TableRow key={article.id}>
              <TableCell className="font-medium">
                <Link
                  to="/projects/$projectId/articles/$articleId"
                  params={{ projectId: article.blog_project_id, articleId: article.id }}
                  className="text-blue-600 hover:text-blue-700 hover:underline max-w-[400px] block overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {article.title}
                </Link>
              </TableCell>
              <TableCell>{formatDate(article.published_at)}</TableCell>
              <TableCell>
                <Badge variant="secondary">0</Badge>
              </TableCell>
              <TableCell>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-slate-600 hover:text-slate-900 text-sm max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {getDomainFromUrl(article.url)}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              </TableCell>
              {isArchived && (
                <TableCell className="text-sm text-slate-500">
                  {formatDate(article.archived_at)}
                </TableCell>
              )}
              <TableCell>
                {isArchived ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestore(article.id)}
                    disabled={restoreMutation.isPending}
                  >
                    {t('articlesTable.restore')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchive(article.id)}
                    disabled={archiveMutation.isPending}
                  >
                    {t('articlesTable.archive')}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'active' | 'archived')}>
      <TabsList className="mb-4">
        <TabsTrigger value="active">{t('articlesTable.tabActive')}</TabsTrigger>
        <TabsTrigger value="archived">{t('articlesTable.tabArchived')}</TabsTrigger>
      </TabsList>

      <TabsContent value="active">
        {renderTableContent(articles, isLoading, error, false)}
      </TabsContent>

      <TabsContent value="archived">
        {renderTableContent(archivedArticles, archivedLoading, archivedError, true)}
      </TabsContent>
    </Tabs>
  )
}
