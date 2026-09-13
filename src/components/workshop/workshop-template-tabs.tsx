import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WORKSPACE_TABS, type WorkspaceTab } from '@/lib/pin-template-workspace'

interface WorkshopTemplateTabsProps {
  activeTab: WorkspaceTab
  counts: Record<WorkspaceTab, number>
  onTabChange: (tab: WorkspaceTab) => void
}

/**
 * The middle-column workspace tabs — Offen / Freigegeben / Archiv — each with a
 * live count badge. Controlled: the parent owns the active tab.
 */
export function WorkshopTemplateTabs({ activeTab, counts, onTabChange }: WorkshopTemplateTabsProps) {
  const { t } = useTranslation()

  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as WorkspaceTab)}>
      <TabsList>
        {WORKSPACE_TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab} className="gap-1.5">
            <span>{t(`workshop.tabs.${tab}`)}</span>
            <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {counts[tab]}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
