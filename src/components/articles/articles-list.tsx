import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ArticleDataTable } from './article-data-table'
import {
  useArticlesPaginated,
  useArchivedArticlesPaginated,
  useArchiveArticle,
  useRestoreArticle,
  useDeleteArticle,
  useBulkDeleteArticles,
  useBulkArchiveArticles,
  useBulkRestoreArticles,
} from '@/lib/hooks/use-articles'
import { useRealtimeInvalidation } from '@/lib/hooks/use-realtime'
import { usePins } from '@/lib/hooks/use-pins'
import type { Article, ArticleSortField } from '@/types/articles'

type SortDirection = 'asc' | 'desc'

interface ArticlesListProps {
  projectId: string
}

export function ArticlesList({ projectId }: ArticlesListProps) {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [sortField, setSortField] = useState<ArticleSortField>('published_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialog states
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<string | null>(null)

  // Realtime
  useRealtimeInvalidation(
    `articles:${projectId}`,
    { event: 'INSERT', table: 'blog_articles', filter: `blog_project_id=eq.${projectId}` },
    [['articles', projectId, 'paginated'], ['articles', projectId, 'archived', 'paginated']],
  )

  // Data fetching - paginated
  const {
    data: activeData,
    isLoading: activeLoading,
    error: activeError,
    hasNextPage: activeHasNext,
    fetchNextPage: fetchActiveNext,
    isFetchingNextPage: activeFetchingNext,
  } = useArticlesPaginated(projectId)

  const {
    data: archivedData,
    isLoading: archivedLoading,
    error: archivedError,
    hasNextPage: archivedHasNext,
    fetchNextPage: fetchArchivedNext,
    isFetchingNextPage: archivedFetchingNext,
  } = useArchivedArticlesPaginated(projectId)

  const { data: pins } = usePins(projectId)

  // Flatten paginated data
  const activeArticles = useMemo(
    () => activeData?.pages.flatMap((page) => page.articles) ?? [],
    [activeData]
  )
  const archivedArticles = useMemo(
    () => archivedData?.pages.flatMap((page) => page.articles) ?? [],
    [archivedData]
  )

  const currentArticles = activeTab === 'active' ? activeArticles : archivedArticles
  const isLoading = activeTab === 'active' ? activeLoading : archivedLoading
  const error = activeTab === 'active' ? activeError : archivedError
  const hasNextPage = activeTab === 'active' ? activeHasNext : archivedHasNext
  const fetchNextPage = activeTab === 'active' ? fetchActiveNext : fetchArchivedNext
  const isFetchingNextPage = activeTab === 'active' ? activeFetchingNext : archivedFetchingNext

  // Pin count lookup
  const pinCountByArticle = useMemo(() => {
    if (!pins) return {}
    const counts: Record<string, number> = {}
    for (const pin of pins) {
      counts[pin.blog_article_id] = (counts[pin.blog_article_id] || 0) + 1
    }
    return counts
  }, [pins])

  // Mutations
  const archiveMutation = useArchiveArticle()
  const restoreMutation = useRestoreArticle()
  const deleteMutation = useDeleteArticle()
  const bulkDeleteMutation = useBulkDeleteArticles()
  const bulkArchiveMutation = useBulkArchiveArticles()
  const bulkRestoreMutation = useBulkRestoreArticles()

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === currentArticles.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(currentArticles.map((a) => a.id)))
    }
  }, [selectedIds.size, currentArticles])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Tab change clears selection
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'active' | 'archived')
    clearSelection()
  }

  // Sort handler
  const handleSort = (field: ArticleSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Single actions
  const handleArchive = async (articleId: string) => {
    await archiveMutation.mutateAsync(articleId)
  }

  const handleRestore = async (articleId: string) => {
    await restoreMutation.mutateAsync(articleId)
  }

  const handleDeleteSingle = (id: string) => {
    setSingleDeleteTarget(id)
  }

  const confirmSingleDelete = async () => {
    if (!singleDeleteTarget) return
    await deleteMutation.mutateAsync(singleDeleteTarget)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(singleDeleteTarget)
      return next
    })
    setSingleDeleteTarget(null)
  }

  // Bulk actions
  const handleBulkDelete = () => {
    setBulkDeleteOpen(true)
  }

  const confirmBulkDelete = async () => {
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds))
    clearSelection()
    setBulkDeleteOpen(false)
  }

  const handleBulkArchive = () => {
    setBulkArchiveOpen(true)
  }

  const confirmBulkArchive = async () => {
    await bulkArchiveMutation.mutateAsync(Array.from(selectedIds))
    clearSelection()
    setBulkArchiveOpen(false)
  }

  const handleBulkRestore = async () => {
    await bulkRestoreMutation.mutateAsync(Array.from(selectedIds))
    clearSelection()
  }

  // Formatting
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

  const hasSelection = selectedIds.size > 0

  // Render props for table
  const renderTitleCell = (article: Article) => (
    <Link
      to="/projects/$projectId/articles/$articleId"
      params={{ projectId: article.blog_project_id, articleId: article.id }}
      className="text-blue-600 hover:text-blue-700 hover:underline max-w-[400px] block overflow-hidden text-ellipsis whitespace-nowrap"
    >
      {article.title}
    </Link>
  )

  const renderPinCountCell = (article: Article) => (
    <Badge variant="secondary">{pinCountByArticle[article.id] || 0}</Badge>
  )

  const renderUrlCell = (article: Article) => (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-slate-600 hover:text-slate-900 text-sm max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap"
    >
      {getDomainFromUrl(article.url)}
      <ExternalLink className="h-3 w-3 flex-shrink-0" />
    </a>
  )

  const renderActionsCell = (article: Article) => (
    <div className="flex items-center gap-1">
      {activeTab === 'active' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleArchive(article.id)}
          disabled={archiveMutation.isPending}
        >
          <Archive className="h-3.5 w-3.5 mr-1" />
          {t('articlesTable.archive')}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRestore(article.id)}
          disabled={restoreMutation.isPending}
        >
          <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
          {t('articlesTable.restore')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => handleDeleteSingle(article.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <p className="text-red-600">{t('articlesTable.errorLoadFailed')}</p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="active">{t('articlesTable.tabActive')}</TabsTrigger>
          <TabsTrigger value="archived">{t('articlesTable.tabArchived')}</TabsTrigger>
        </TabsList>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {currentArticles.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={currentArticles.length > 0 && selectedIds.size === currentArticles.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t('articlesTable.selectAll')}
                />
                <span className="text-sm text-slate-500">
                  {hasSelection
                    ? t('articlesTable.selected', { count: selectedIds.size })
                    : t('articlesTable.selectAll')}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasSelection && (
              <>
                {activeTab === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkArchive}
                    disabled={bulkArchiveMutation.isPending}
                  >
                    <Archive className="mr-1 h-3.5 w-3.5" />
                    {t('articlesTable.bulkArchive', { count: selectedIds.size })}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkRestore}
                    disabled={bulkRestoreMutation.isPending}
                  >
                    <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                    {t('articlesTable.bulkRestore', { count: selectedIds.size })}
                  </Button>
                )}

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {t('articlesTable.bulkDelete', { count: selectedIds.size })}
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value="active">
          {activeArticles.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-slate-500 text-sm">{t('articlesTable.emptyActive')}</p>
            </div>
          ) : (
            <>
              <ArticleDataTable
                articles={activeArticles}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                pinCountByArticle={pinCountByArticle}
                isArchived={false}
                renderTitleCell={renderTitleCell}
                renderPinCountCell={renderPinCountCell}
                renderUrlCell={renderUrlCell}
                renderActionsCell={renderActionsCell}
                formatDate={formatDate}
              />
              {activeHasNext && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchActiveNext()}
                    disabled={activeFetchingNext}
                  >
                    {activeFetchingNext ? t('common.loading') : t('articlesTable.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="archived">
          {archivedArticles.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-slate-500 text-sm">{t('articlesTable.emptyArchived')}</p>
            </div>
          ) : (
            <>
              <ArticleDataTable
                articles={archivedArticles}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                pinCountByArticle={pinCountByArticle}
                isArchived={true}
                renderTitleCell={renderTitleCell}
                renderPinCountCell={renderPinCountCell}
                renderUrlCell={renderUrlCell}
                renderActionsCell={renderActionsCell}
                formatDate={formatDate}
              />
              {archivedHasNext && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchArchivedNext()}
                    disabled={archivedFetchingNext}
                  >
                    {archivedFetchingNext ? t('common.loading') : t('articlesTable.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('articlesTable.bulkDeleteTitle', { count: selectedIds.size })}
            </DialogTitle>
            <DialogDescription>
              {t('articlesTable.bulkDeleteMessage', { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkDeleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Archive Dialog */}
      <Dialog open={bulkArchiveOpen} onOpenChange={setBulkArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('articlesTable.bulkArchiveTitle', { count: selectedIds.size })}
            </DialogTitle>
            <DialogDescription>
              {t('articlesTable.bulkArchiveMessage', { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkArchiveOpen(false)}
              disabled={bulkArchiveMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmBulkArchive} disabled={bulkArchiveMutation.isPending}>
              {bulkArchiveMutation.isPending ? t('common.archiving') : t('articlesTable.archive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Delete Dialog */}
      <Dialog
        open={singleDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSingleDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articlesTable.deleteSingleTitle')}</DialogTitle>
            <DialogDescription>{t('articlesTable.deleteSingleMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSingleDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmSingleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
