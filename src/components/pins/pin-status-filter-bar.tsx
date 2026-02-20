import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Pin, PinStatus } from '@/types/pins'

export const STATUS_TABS = ['all', 'draft', 'generation', 'metadata_created', 'published', 'error'] as const
export type StatusTab = (typeof STATUS_TABS)[number]

export const STATUS_TAB_GROUPS: Record<Exclude<StatusTab, 'all'>, PinStatus[]> = {
  draft: ['draft'],
  generation: ['generate_metadata', 'generating_metadata'],
  metadata_created: ['metadata_created'],
  published: ['published'],
  error: ['error'],
}

export const TAB_LABEL_KEYS: Record<StatusTab, string> = {
  all: 'pinsList.all',
  draft: 'pinsList.tab_draft',
  generation: 'pinsList.tab_generation',
  metadata_created: 'pinsList.tab_metadata_created',
  published: 'pinsList.tab_published',
  error: 'pinsList.tab_error',
}

export function computeTabCounts(pins: Pin[]): Record<StatusTab, number> {
  const counts: Record<StatusTab, number> = {
    all: 0, draft: 0, generation: 0, metadata_created: 0,
    published: 0, error: 0,
  }
  counts.all = pins.length
  for (const pin of pins) {
    for (const [tab, statuses] of Object.entries(STATUS_TAB_GROUPS)) {
      if (statuses.includes(pin.status)) {
        counts[tab as StatusTab]++
      }
    }
  }
  return counts
}

export function filterPinsByTab(pins: Pin[], tab: StatusTab): Pin[] {
  if (tab === 'all') return pins
  const statuses = STATUS_TAB_GROUPS[tab]
  return pins.filter((pin) => statuses.includes(pin.status))
}

interface PinStatusFilterBarProps {
  pins: Pin[]
  activeTab: StatusTab
  onTabChange: (tab: StatusTab) => void
}

export function PinStatusFilterBar({ pins, activeTab, onTabChange }: PinStatusFilterBarProps) {
  const { t } = useTranslation()

  const tabCounts = useMemo(() => computeTabCounts(pins), [pins])

  return (
    <>
      {/* Mobile: dropdown select */}
      <div className="sm:hidden">
        <Select value={activeTab} onValueChange={(v) => onTabChange(v as StatusTab)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_TABS.map((tab) => (
              <SelectItem key={tab} value={tab}>
                {t(TAB_LABEL_KEYS[tab])}
                {tabCounts[tab] > 0 && ` (${tabCounts[tab]})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: tab bar */}
      <div className="hidden sm:block">
        <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as StatusTab)}>
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(TAB_LABEL_KEYS[tab])}
                {tabCounts[tab] > 0 && (
                  <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium leading-none">
                    {tabCounts[tab]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </>
  )
}
