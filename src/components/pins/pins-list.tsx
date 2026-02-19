import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpDown,
  LayoutGrid,
  LayoutList,
  Trash2,
  ImageIcon,
  Sparkles,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { PinCard } from '@/components/pins/pin-card'
import { PinDataTable } from '@/components/pins/pin-data-table'
import { ColumnVisibilityToggle } from '@/components/pins/column-visibility-toggle'
import { getColumnsForIds, getStoredVisibility, saveVisibility } from '@/components/pins/pin-data-table-columns'
import type { PinColumnId } from '@/components/pins/pin-data-table-columns'
import { usePins, useBulkDeletePins, useBulkUpdatePinStatus, useDeletePin } from '@/lib/hooks/use-pins'
import { useArticles } from '@/lib/hooks/use-articles'
import { useTriggerBulkMetadata } from '@/lib/hooks/use-metadata'
import { usePublishPinsBulk } from '@/lib/hooks/use-pinterest-publishing'
import { useRealtimeInvalidation } from '@/lib/hooks/use-realtime'
import { PinStatusFilterBar, filterPinsByTab, TAB_LABEL_KEYS } from '@/components/pins/pin-status-filter-bar'
import type { StatusTab } from '@/components/pins/pin-status-filter-bar'
import { ACTIVE_STATUSES } from '@/types/pins'
import type { PinStatus, PinSortField, PinViewMode, Pin } from '@/types/pins'

type SortDirection = 'asc' | 'desc'

const TABLE_COLUMNS: PinColumnId[] = [
  'select', 'image', 'title', 'article', 'board', 'status',
  'scheduled_at', 'published_at', 'created_at', 'updated_at', 'actions',
]

interface PinsListProps {
  projectId: string
}


export function PinsList({ projectId }: PinsListProps) {
  const { t, i18n } = useTranslation()
  const [viewMode, setViewMode] = useState<PinViewMode>('table')
  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [sortField, setSortField] = useState<PinSortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<string | null>(null)
  const [columnVisibility, setColumnVisibility] = useState(() => getStoredVisibility('pin-table-columns', TABLE_COLUMNS))

  useEffect(() => {
    saveVisibility('pin-table-columns', columnVisibility)
  }, [columnVisibility])

  useRealtimeInvalidation(
    `pins:${projectId}`,
    { event: 'UPDATE', table: 'pins', filter: `blog_project_id=eq.${projectId}` },
    [['pins', projectId]],
  )

  const { data: pins, isLoading, error } = usePins(projectId)
  const { data: articles } = useArticles(projectId)

  const bulkDeleteMutation = useBulkDeletePins()
  const bulkStatusMutation = useBulkUpdatePinStatus()
  const deletePinMutation = useDeletePin()
  const triggerBulkMetadata = useTriggerBulkMetadata()
  const publishBulkMutation = usePublishPinsBulk()

  // Build article lookup map
  const articleMap = useMemo(() => {
    if (!articles) return new Map<string, string>()
    return new Map(articles.map((a) => [a.id, a.title]))
  }, [articles])

  // Filter pins by status tab
  const filteredPins = useMemo(() => {
    if (!pins) return []
    return filterPinsByTab(pins, activeTab)
  }, [pins, activeTab])

  // Column defs for the visibility toggle
  const columnDefs = useMemo(() => getColumnsForIds(TABLE_COLUMNS), [])

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
    if (selectedIds.size === filteredPins.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPins.map((p) => p.id)))
    }
  }, [selectedIds.size, filteredPins])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Sort handler for dropdown
  const handleSort = (field: PinSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Column visibility toggle
  const handleToggleColumn = useCallback((id: PinColumnId) => {
    setColumnVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // Bulk actions
  const handleBulkDelete = () => {
    setBulkDeleteOpen(true)
  }

  const confirmBulkDelete = async () => {
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds))
    clearSelection()
    setBulkDeleteOpen(false)
  }

  const handleBulkStatusChange = async (status: PinStatus) => {
    await bulkStatusMutation.mutateAsync({
      ids: Array.from(selectedIds),
      status,
    })
    clearSelection()
  }

  const handleBulkGenerateMetadata = () => {
    triggerBulkMetadata.mutate({ pin_ids: Array.from(selectedIds) })
    clearSelection()
  }

  const handleBulkPublish = async () => {
    await publishBulkMutation.mutateAsync({ pin_ids: Array.from(selectedIds) })
    clearSelection()
  }

  // Single pin delete
  const handleDeletePin = (id: string) => {
    setSingleDeleteTarget(id)
  }

  const confirmSingleDelete = async () => {
    if (!singleDeleteTarget) return
    await deletePinMutation.mutateAsync(singleDeleteTarget)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(singleDeleteTarget)
      return next
    })
    setSingleDeleteTarget(null)
  }

  // Tab change clears selection
  const handleTabChange = (value: StatusTab) => {
    setActiveTab(value)
    clearSelection()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const hasSelection = selectedIds.size > 0

  // Render props for PinDataTable
  const renderTitleCell = (pin: Pin) => (
    <Link
      to="/projects/$projectId/pins/$pinId"
      params={{ projectId: pin.blog_project_id, pinId: pin.id }}
      className="text-blue-600 hover:text-blue-700 hover:underline max-w-[300px] block overflow-hidden text-ellipsis whitespace-nowrap"
    >
      {pin.title ? (
        pin.title
      ) : (
        <span className="italic text-slate-400">{t('common.untitled')}</span>
      )}
    </Link>
  )

  const renderLookupCell = (pin: Pin) => (
    <span className="text-sm text-slate-600 max-w-[180px] block overflow-hidden text-ellipsis whitespace-nowrap">
      {articleMap.get(pin.blog_article_id) || t('pinsList.unknownArticle')}
    </span>
  )

  const renderActionsCell = (pin: Pin) => (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/projects/$projectId/pins/$pinId" params={{ projectId: pin.blog_project_id, pinId: pin.id }}>
          {t('pinsList.viewEdit')}
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => handleDeletePin(pin.id)}
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
        <p className="text-red-600">{t('pinsList.errorLoadFailed')}</p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PinStatusFilterBar
        pins={pins || []}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

        {/* Toolbar row */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-md border">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode('table')}
                aria-label="Table view"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>

            {/* Select all (table view) */}
            {viewMode === 'table' && filteredPins.length > 0 && (
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  checked={filteredPins.length > 0 && selectedIds.size === filteredPins.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all pins"
                />
                <span className="text-sm text-slate-500">
                  {hasSelection ? t('pinsList.selected', { count: selectedIds.size }) : t('pinsList.selectAll')}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk actions */}
            {hasSelection && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkGenerateMetadata}
                  disabled={triggerBulkMetadata.isPending}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {t('pinsList.generate', { count: selectedIds.size })}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkPublish}
                  disabled={publishBulkMutation.isPending}
                >
                  <Send className="mr-1 h-3.5 w-3.5" />
                  {t('pinsList.publish', { count: selectedIds.size })}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {t('pinsList.changeStatus')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {ACTIVE_STATUSES.map((status) => (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => handleBulkStatusChange(status)}
                      >
                        <PinStatusBadge status={status} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {t('pinsList.deletePinsTitle', { count: selectedIds.size })}
                </Button>
              </>
            )}

            {/* Column visibility toggle */}
            <ColumnVisibilityToggle
              columns={columnDefs}
              visibility={columnVisibility}
              onToggle={handleToggleColumn}
            />

            {/* Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {t('pinsList.sort')}
                  <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleSort('title')}>
                  {t('pinsList.sortTitle')} {sortField === 'title' && (sortDirection === 'asc' ? t('pinsList.sortAZ') : t('pinsList.sortZA'))}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('status')}>
                  {t('pinsList.sortStatus')} {sortField === 'status' && (sortDirection === 'asc' ? t('pinsList.sortAZ') : t('pinsList.sortZA'))}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('created_at')}>
                  {t('pinsList.sortCreated')} {sortField === 'created_at' && (sortDirection === 'asc' ? t('pinsList.sortOldest') : t('pinsList.sortNewest'))}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('updated_at')}>
                  {t('pinsList.sortUpdated')} {sortField === 'updated_at' && (sortDirection === 'asc' ? t('pinsList.sortOldest') : t('pinsList.sortNewest'))}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('scheduled_at')}>
                  {t('pinsList.sortScheduled')} {sortField === 'scheduled_at' && (sortDirection === 'asc' ? t('pinsList.sortOldest') : t('pinsList.sortNewest'))}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('published_at')}>
                  {t('pinsList.sortPublished')} {sortField === 'published_at' && (sortDirection === 'asc' ? t('pinsList.sortOldest') : t('pinsList.sortNewest'))}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Pin content */}
        {filteredPins.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : viewMode === 'table' ? (
          <PinDataTable
            pins={filteredPins}
            columns={TABLE_COLUMNS}
            visibility={columnVisibility}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            renderTitleCell={renderTitleCell}
            renderLookupCell={renderLookupCell}
            renderActionsCell={renderActionsCell}
            formatDate={formatDate}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredPins.map((pin) => (
              <PinCard
                key={pin.id}
                pin={pin}
                selected={selectedIds.has(pin.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

      {/* Bulk delete confirmation dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pinsList.deletePinsTitle', { count: selectedIds.size })}</DialogTitle>
            <DialogDescription>
              {t('pinsList.deletePinsMessage', { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleteMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single delete confirmation dialog */}
      <Dialog open={singleDeleteTarget !== null} onOpenChange={(open) => { if (!open) setSingleDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pinsList.deleteSingleTitle')}</DialogTitle>
            <DialogDescription>
              {t('pinsList.deleteSingleMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleDeleteTarget(null)} disabled={deletePinMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmSingleDelete} disabled={deletePinMutation.isPending}>
              {deletePinMutation.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function EmptyState({ tab }: { tab: StatusTab }) {
  const { t } = useTranslation()

  const message =
    tab === 'all'
      ? t('pinsList.emptyAll')
      : t('pinsList.emptyStatus', { status: t(TAB_LABEL_KEYS[tab]) })

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <ImageIcon className="h-10 w-10 text-slate-300" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  )
}
