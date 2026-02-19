import { Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PinColumnDef, PinColumnId } from './pin-data-table-columns'

interface ColumnVisibilityToggleProps {
  columns: PinColumnDef[]
  visibility: Record<PinColumnId, boolean>
  onToggle: (id: PinColumnId) => void
}

export function ColumnVisibilityToggle({ columns, visibility, onToggle }: ColumnVisibilityToggleProps) {
  const { t } = useTranslation()

  const toggleableColumns = columns.filter((col) => col.toggleable)

  if (toggleableColumns.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t('pinTable.toggleColumns')}>
          <Settings2 className="h-3.5 w-3.5" />
          <span className="ml-1 hidden sm:inline">{t('pinTable.columns')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {toggleableColumns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={visibility[col.id]}
            onCheckedChange={() => onToggle(col.id)}
          >
            {t(col.labelKey)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
