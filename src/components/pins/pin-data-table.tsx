import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { PinMediaPreview } from '@/components/pins/pin-media-preview'
import { getColumnsForIds } from './pin-data-table-columns'
import type { PinColumnId } from './pin-data-table-columns'
import type { Pin, PinSortField } from '@/types/pins'

interface PinDataTableProps {
  pins: Pin[]
  columns: PinColumnId[]
  visibility: Record<PinColumnId, boolean>
  sortField: PinSortField
  sortDirection: 'asc' | 'desc'
  onSort: (field: PinSortField) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  renderTitleCell: (pin: Pin) => ReactNode
  renderLookupCell?: (pin: Pin) => ReactNode
  renderActionsCell?: (pin: Pin) => ReactNode
  formatDate: (dateString: string) => string
}

export function PinDataTable({
  pins,
  columns,
  visibility,
  sortField,
  sortDirection,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  renderTitleCell,
  renderLookupCell,
  renderActionsCell,
  formatDate,
}: PinDataTableProps) {
  const { t } = useTranslation()

  const columnDefs = useMemo(() => getColumnsForIds(columns), [columns])

  const visibleColumns = useMemo(
    () => columnDefs.filter((col) => visibility[col.id]),
    [columnDefs, visibility],
  )

  // Sort pins
  const sortedPins = useMemo(() => {
    return [...pins].sort((a, b) => {
      let aValue: string | null = null
      let bValue: string | null = null

      switch (sortField) {
        case 'title':
          aValue = a.title
          bValue = b.title
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        case 'created_at':
          aValue = a.created_at
          bValue = b.created_at
          break
        case 'updated_at':
          aValue = a.updated_at
          bValue = b.updated_at
          break
        case 'scheduled_at':
          aValue = a.scheduled_at
          bValue = b.scheduled_at
          break
        case 'published_at':
          aValue = a.published_at
          bValue = b.published_at
          break
      }

      if (aValue === null || aValue === '') return 1
      if (bValue === null || bValue === '') return -1

      const comparison = aValue > bValue ? 1 : -1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [pins, sortField, sortDirection])

  const allSelected = sortedPins.length > 0 && selectedIds.size === sortedPins.length

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

  const renderHeaderCell = (colId: PinColumnId, width?: string, sortFld?: PinSortField, label?: string) => {
    const className = [
      width,
      sortFld ? 'cursor-pointer' : '',
    ].filter(Boolean).join(' ')

    return (
      <TableHead
        key={colId}
        className={className}
        onClick={sortFld ? () => onSort(sortFld) : undefined}
      >
        {label}
        {sortFld && getSortIcon(sortFld)}
      </TableHead>
    )
  }

  const renderCell = (colId: PinColumnId, pin: Pin) => {
    switch (colId) {
      case 'select':
        return (
          <TableCell key={colId}>
            <Checkbox
              checked={selectedIds.has(pin.id)}
              onCheckedChange={() => onToggleSelect(pin.id)}
              aria-label={`Select pin ${pin.title || t('common.untitled')}`}
            />
          </TableCell>
        )
      case 'image':
        return (
          <TableCell key={colId}>
            <div className="h-12 w-12 overflow-hidden rounded bg-slate-100">
              <PinMediaPreview pin={pin} />
            </div>
          </TableCell>
        )
      case 'title':
        return (
          <TableCell key={colId} className="font-medium">
            {renderTitleCell(pin)}
          </TableCell>
        )
      case 'article':
      case 'project':
        return (
          <TableCell key={colId}>
            {renderLookupCell?.(pin)}
          </TableCell>
        )
      case 'board':
        return (
          <TableCell key={colId}>
            <span className="text-sm text-slate-600 max-w-[160px] block overflow-hidden text-ellipsis whitespace-nowrap">
              {pin.pinterest_board_name || '—'}
            </span>
          </TableCell>
        )
      case 'status':
        return (
          <TableCell key={colId}>
            <PinStatusBadge status={pin.status} />
          </TableCell>
        )
      case 'scheduled_at':
        return (
          <TableCell key={colId} className="text-sm text-slate-500">
            {pin.scheduled_at ? formatDate(pin.scheduled_at) : '—'}
          </TableCell>
        )
      case 'published_at':
        return (
          <TableCell key={colId} className="text-sm text-slate-500">
            {pin.published_at ? formatDate(pin.published_at) : '—'}
          </TableCell>
        )
      case 'created_at':
        return (
          <TableCell key={colId} className="text-sm text-slate-500">
            {formatDate(pin.created_at)}
          </TableCell>
        )
      case 'updated_at':
        return (
          <TableCell key={colId} className="text-sm text-slate-500">
            {formatDate(pin.updated_at)}
          </TableCell>
        )
      case 'actions':
        return (
          <TableCell key={colId}>
            {renderActionsCell?.(pin)}
          </TableCell>
        )
      default:
        return null
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {visibleColumns.map((col) => {
            if (col.id === 'select') {
              return (
                <TableHead key={col.id} className={col.width}>
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={onToggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )
            }
            if (col.id === 'actions') {
              return <TableHead key={col.id} className={col.width} />
            }
            return renderHeaderCell(col.id, col.width, col.sortField, col.labelKey ? t(col.labelKey) : '')
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedPins.map((pin) => (
          <TableRow key={pin.id} data-state={selectedIds.has(pin.id) ? 'selected' : undefined}>
            {visibleColumns.map((col) => renderCell(col.id, pin))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
