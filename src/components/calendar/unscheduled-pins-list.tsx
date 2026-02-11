import { useState, useMemo, useCallback } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CalendarIcon,
  ImageIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { BulkScheduleDialog } from '@/components/pins/bulk-schedule-dialog'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { getPinImageUrl } from '@/lib/api/pins'
import type { Pin, PinSortField } from '@/types/pins'

type SortDirection = 'asc' | 'desc'

interface UnscheduledPinsListProps {
  pins: Pin[]
  onPinClick: (pinId: string) => void
}

export function UnscheduledPinsList({ pins, onPinClick }: UnscheduledPinsListProps) {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkScheduleOpen, setBulkScheduleOpen] = useState(false)
  const [sortField, setSortField] = useState<PinSortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const { data: projects } = useBlogProjects()

  // Build project lookup map
  const projectMap = useMemo(() => {
    if (!projects) return new Map<string, string>()
    return new Map(projects.map((p) => [p.id, p.name]))
  }, [projects])

  // Sort pins
  const sortedPins = useMemo(() => {
    return [...pins].sort((a, b) => {
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
  }, [pins, sortField, sortDirection])

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

  const handleBulkSchedule = () => {
    setBulkScheduleOpen(true)
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

  // Empty state
  if (pins.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <CalendarIcon className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 mb-2">{t('unscheduledPins.emptyMessage')}</p>
        <p className="text-sm text-slate-500">
          {t('unscheduledPins.emptyHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Select all checkbox */}
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            aria-label={t('pinsList.selectAll')}
          />
          <span className="text-sm text-slate-500">
            {hasSelection ? t('pinsList.selected', { count: selectedIds.size }) : t('pinsList.selectAll')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk schedule button */}
          {hasSelection && (
            <Button variant="outline" size="sm" onClick={handleBulkSchedule}>
              <CalendarIcon className="mr-1 h-3.5 w-3.5" />
              {t('pinsList.schedule', { count: selectedIds.size })}
            </Button>
          )}

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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t('pinsList.selectAll')}
                />
              </TableHead>
              <TableHead className="w-[60px]">{t('unscheduledPins.columnImage')}</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('title')}>
                {t('unscheduledPins.columnTitle')} {getSortIcon('title')}
              </TableHead>
              <TableHead className="w-[200px]">{t('unscheduledPins.columnProject')}</TableHead>
              <TableHead className="cursor-pointer w-[180px]" onClick={() => handleSort('status')}>
                {t('unscheduledPins.columnStatus')} {getSortIcon('status')}
              </TableHead>
              <TableHead className="cursor-pointer w-[120px]" onClick={() => handleSort('created_at')}>
                {t('unscheduledPins.columnCreated')} {getSortIcon('created_at')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPins.map((pin) => (
              <TableRow key={pin.id} data-state={selectedIds.has(pin.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(pin.id)}
                    onCheckedChange={() => toggleSelect(pin.id)}
                    aria-label={`Select pin ${pin.title || t('common.untitled')}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="h-10 w-10 overflow-hidden rounded bg-slate-100">
                    <img
                      src={getPinImageUrl(pin.image_path)}
                      alt={pin.title || 'Pin thumbnail'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  <button
                    onClick={() => onPinClick(pin.id)}
                    className="text-blue-600 hover:text-blue-700 hover:underline text-left max-w-[300px] block overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {pin.title ? (
                      pin.title
                    ) : (
                      <span className="italic text-slate-400">{t('common.untitled')}</span>
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-slate-600 max-w-[180px] block overflow-hidden text-ellipsis whitespace-nowrap">
                    {projectMap.get(pin.blog_project_id) || t('unscheduledPins.unknownProject')}
                  </span>
                </TableCell>
                <TableCell>
                  <PinStatusBadge status={pin.status} />
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  {formatDate(pin.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Bulk schedule dialog */}
      <BulkScheduleDialog
        pinIds={Array.from(selectedIds)}
        open={bulkScheduleOpen}
        onOpenChange={(open) => {
          setBulkScheduleOpen(open)
          if (!open) clearSelection()
        }}
      />
    </div>
  )
}
