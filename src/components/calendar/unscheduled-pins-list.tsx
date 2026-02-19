import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ArrowUpDown,
  CalendarIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PinDataTable } from '@/components/pins/pin-data-table'
import { ColumnVisibilityToggle } from '@/components/pins/column-visibility-toggle'
import { getColumnsForIds, getStoredVisibility, saveVisibility } from '@/components/pins/pin-data-table-columns'
import type { PinColumnId } from '@/components/pins/pin-data-table-columns'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import type { Pin, PinSortField } from '@/types/pins'

type SortDirection = 'asc' | 'desc'

const TABLE_COLUMNS: PinColumnId[] = [
  'select', 'image', 'title', 'project', 'status', 'scheduled_at', 'created_at',
]

interface UnscheduledPinsListProps {
  pins: Pin[]
  onPinClick: (pinId: string) => void
}

export function UnscheduledPinsList({ pins, onPinClick }: UnscheduledPinsListProps) {
  const { t, i18n } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<PinSortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [columnVisibility, setColumnVisibility] = useState(() => getStoredVisibility('unscheduled-pin-table-columns', TABLE_COLUMNS))

  useEffect(() => {
    saveVisibility('unscheduled-pin-table-columns', columnVisibility)
  }, [columnVisibility])

  const { data: projects } = useBlogProjects()

  // Build project lookup map
  const projectMap = useMemo(() => {
    if (!projects) return new Map<string, string>()
    return new Map(projects.map((p) => [p.id, p.name]))
  }, [projects])

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
    if (selectedIds.size === pins.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pins.map((p) => p.id)))
    }
  }, [selectedIds.size, pins])

  // Sort handler
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const hasSelection = selectedIds.size > 0
  const allSelected = pins.length > 0 && selectedIds.size === pins.length

  // Render props for PinDataTable
  const renderTitleCell = (pin: Pin) => (
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
  )

  const renderLookupCell = (pin: Pin) => (
    <span className="text-sm text-slate-600 max-w-[180px] block overflow-hidden text-ellipsis whitespace-nowrap">
      {projectMap.get(pin.blog_project_id) || t('unscheduledPins.unknownProject')}
    </span>
  )

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
              <DropdownMenuItem onClick={() => handleSort('scheduled_at')}>
                {t('pinsList.sortScheduled')} {sortField === 'scheduled_at' && (sortDirection === 'asc' ? t('pinsList.sortOldest') : t('pinsList.sortNewest'))}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <PinDataTable
          pins={pins}
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
          formatDate={formatDate}
        />
      </div>

    </div>
  )
}
