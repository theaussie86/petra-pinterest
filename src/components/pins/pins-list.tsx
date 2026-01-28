import { useState, useMemo, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MoreHorizontal,
  LayoutGrid,
  LayoutList,
  Trash2,
  ImageIcon,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { PinCard } from '@/components/pins/pin-card'
import { usePins, useBulkDeletePins, useBulkUpdatePinStatus, useDeletePin } from '@/lib/hooks/use-pins'
import { useArticles } from '@/lib/hooks/use-articles'
import { getPinImageUrl } from '@/lib/api/pins'
import { PIN_STATUS, PHASE4_ACTIVE_STATUSES } from '@/types/pins'
import type { PinStatus, PinSortField, PinViewMode } from '@/types/pins'

type SortDirection = 'asc' | 'desc'

interface PinsListProps {
  projectId: string
}

const STATUS_TABS = ['all', 'entwurf', 'bereit_fuer_generierung', 'fehler'] as const
type StatusTab = (typeof STATUS_TABS)[number]

export function PinsList({ projectId }: PinsListProps) {
  const [viewMode, setViewMode] = useState<PinViewMode>('table')
  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [sortField, setSortField] = useState<PinSortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: pins, isLoading, error } = usePins(projectId)
  const { data: articles } = useArticles(projectId)
  const bulkDeleteMutation = useBulkDeletePins()
  const bulkStatusMutation = useBulkUpdatePinStatus()
  const deletePinMutation = useDeletePin()

  // Build article lookup map
  const articleMap = useMemo(() => {
    if (!articles) return new Map<string, string>()
    return new Map(articles.map((a) => [a.id, a.title]))
  }, [articles])

  // Filter pins by status tab
  const filteredPins = useMemo(() => {
    if (!pins) return []
    if (activeTab === 'all') return pins
    return pins.filter((pin) => pin.status === activeTab)
  }, [pins, activeTab])

  // Sort pins
  const sortedPins = useMemo(() => {
    return [...filteredPins].sort((a, b) => {
      let aValue: string | null = null
      let bValue: string | null = null

      if (sortField === 'title') {
        aValue = a.title
        bValue = b.title
      } else if (sortField === 'status') {
        aValue = a.status
        bValue = b.status
      } else if (sortField === 'created_at') {
        aValue = a.created_at
        bValue = b.created_at
      } else if (sortField === 'updated_at') {
        aValue = a.updated_at
        bValue = b.updated_at
      }

      if (aValue === null || aValue === '') return 1
      if (bValue === null || bValue === '') return -1

      const comparison = aValue > bValue ? 1 : -1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredPins, sortField, sortDirection])

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
    if (selectedIds.size === sortedPins.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedPins.map((p) => p.id)))
    }
  }, [selectedIds.size, sortedPins])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Sort handler
  const handleSort = (field: PinSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortIcon = (field: PinSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 inline" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3 inline" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 inline" />
    )
  }

  // Bulk actions
  const handleBulkDelete = async () => {
    const count = selectedIds.size
    if (!window.confirm(`Delete ${count} pin${count > 1 ? 's' : ''}? This cannot be undone.`)) {
      return
    }
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds))
    clearSelection()
  }

  const handleBulkStatusChange = async (status: PinStatus) => {
    await bulkStatusMutation.mutateAsync({
      ids: Array.from(selectedIds),
      status,
    })
    clearSelection()
  }

  // Single pin delete
  const handleDeletePin = async (id: string) => {
    if (!window.confirm('Delete this pin? This cannot be undone.')) return
    await deletePinMutation.mutateAsync(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Tab change clears selection
  const handleTabChange = (value: string) => {
    setActiveTab(value as StatusTab)
    clearSelection()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const hasSelection = selectedIds.size > 0
  const allSelected = sortedPins.length > 0 && selectedIds.size === sortedPins.length

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
        <p className="text-red-600">Failed to load pins</p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="entwurf">Entwurf</TabsTrigger>
          <TabsTrigger value="bereit_fuer_generierung">Bereit fur Generierung</TabsTrigger>
          <TabsTrigger value="fehler">Fehler</TabsTrigger>
        </TabsList>

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
            {viewMode === 'table' && sortedPins.length > 0 && (
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all pins"
                />
                <span className="text-sm text-slate-500">
                  {hasSelection ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk actions */}
            {hasSelection && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Change Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PHASE4_ACTIVE_STATUSES.map((status) => (
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
                  Delete ({selectedIds.size})
                </Button>
              </>
            )}

            {/* Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Sort
                  <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleSort('title')}>
                  Title {sortField === 'title' && (sortDirection === 'asc' ? '(A-Z)' : '(Z-A)')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('status')}>
                  Status {sortField === 'status' && (sortDirection === 'asc' ? '(A-Z)' : '(Z-A)')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('created_at')}>
                  Created {sortField === 'created_at' && (sortDirection === 'asc' ? '(oldest)' : '(newest)')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort('updated_at')}>
                  Updated {sortField === 'updated_at' && (sortDirection === 'asc' ? '(oldest)' : '(newest)')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Shared content across all tabs */}
        {STATUS_TABS.map((tab) => (
          <TabsContent key={tab} value={tab}>
            {sortedPins.length === 0 ? (
              <EmptyState tab={tab} />
            ) : viewMode === 'table' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">Image</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('title')}>
                      Title {getSortIcon('title')}
                    </TableHead>
                    <TableHead className="w-[200px]">Article</TableHead>
                    <TableHead className="cursor-pointer w-[180px]" onClick={() => handleSort('status')}>
                      Status {getSortIcon('status')}
                    </TableHead>
                    <TableHead className="cursor-pointer w-[120px]" onClick={() => handleSort('created_at')}>
                      Created {getSortIcon('created_at')}
                    </TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPins.map((pin) => (
                    <TableRow key={pin.id} data-state={selectedIds.has(pin.id) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(pin.id)}
                          onCheckedChange={() => toggleSelect(pin.id)}
                          aria-label={`Select pin ${pin.title || 'Untitled'}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="h-12 w-12 overflow-hidden rounded bg-slate-100">
                          <img
                            src={getPinImageUrl(pin.image_path)}
                            alt={pin.title || 'Pin thumbnail'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          to="/pins/$pinId"
                          params={{ pinId: pin.id }}
                          className="text-blue-600 hover:text-blue-700 hover:underline max-w-[300px] block overflow-hidden text-ellipsis whitespace-nowrap"
                        >
                          {pin.title ? (
                            pin.title
                          ) : (
                            <span className="italic text-slate-400">Untitled</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600 max-w-[180px] block overflow-hidden text-ellipsis whitespace-nowrap">
                          {articleMap.get(pin.blog_article_id) || 'Unknown article'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <PinStatusBadge status={pin.status} />
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {formatDate(pin.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/pins/$pinId" params={{ pinId: pin.id }}>
                                View / Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => handleDeletePin(pin.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {sortedPins.map((pin) => (
                  <PinCard
                    key={pin.id}
                    pin={pin}
                    selected={selectedIds.has(pin.id)}
                    onToggleSelect={toggleSelect}
                    imageUrl={getPinImageUrl(pin.image_path)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function EmptyState({ tab }: { tab: StatusTab }) {
  const message =
    tab === 'all'
      ? 'No pins yet. Upload images to create pins.'
      : `No pins with status "${PIN_STATUS[tab as keyof typeof PIN_STATUS]?.label || tab}".`

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <ImageIcon className="h-10 w-10 text-slate-300" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  )
}
