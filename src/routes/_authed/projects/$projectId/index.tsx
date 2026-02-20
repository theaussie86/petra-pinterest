import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Pencil } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { GeminiApiKeyCard } from '@/components/projects/gemini-api-key-card'
import { PinterestConnection } from '@/components/projects/pinterest-connection'
import { ProjectSectionDialog, type FieldConfig } from '@/components/projects/project-section-dialog'
import { clearStoredProjectId } from '@/lib/hooks/use-active-project'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BlogProject } from '@/types/blog-projects'

export const Route = createFileRoute('/_authed/projects/$projectId/')({
  validateSearch: (search: Record<string, unknown>) => ({
    pinterest_connected: (search.pinterest_connected as string) || undefined,
    pinterest_error: (search.pinterest_error as string) || undefined,
  }),
  component: ProjectDetail,
})

// --- Field config for each section ---

const basicInfoFields: FieldConfig[] = [
  { key: 'name', labelKey: 'projectBranding.fieldName', placeholderKey: 'projectBranding.placeholderName', type: 'input' },
  { key: 'blog_url', labelKey: 'projectBranding.fieldBlogUrl', placeholderKey: 'projectBranding.placeholderBlogUrl', type: 'input' },
  { key: 'sitemap_url', labelKey: 'projectBranding.fieldSitemapUrl', placeholderKey: 'projectBranding.placeholderSitemapUrl', type: 'input' },
  { key: 'description', labelKey: 'projectBranding.fieldDescription', placeholderKey: 'projectBranding.placeholderDescription', type: 'textarea' },
]

const scrapingFields: FieldConfig[] = [
  { key: 'scraping_frequency', labelKey: 'projectBranding.fieldScrapingFrequency', type: 'frequency-select' },
]

type SectionKey = 'basicInfo' | 'scraping'

const SECTIONS: { key: SectionKey; titleKey: string; fields: FieldConfig[] }[] = [
  { key: 'basicInfo', titleKey: 'projectBranding.sectionBasicInfo', fields: basicInfoFields },
  { key: 'scraping', titleKey: 'projectBranding.sectionScraping', fields: scrapingFields },
]

// --- Helper components ---

function FieldDisplay({ label, value, isUrl }: { label: string; value: string | null; isUrl?: boolean }) {
  const { t } = useTranslation()
  const notSet = t('projectBranding.notSet')

  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">
        {value ? (
          isUrl ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline break-all"
            >
              {value}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="whitespace-pre-line">{value}</span>
          )
        ) : (
          <span className="text-muted-foreground italic">{notSet}</span>
        )}
      </dd>
    </div>
  )
}

function FrequencyBadge({ frequency }: { frequency: 'daily' | 'weekly' | 'manual' }) {
  const { t } = useTranslation()
  const colors = {
    daily: 'bg-green-100 text-green-800',
    weekly: 'bg-blue-100 text-blue-800',
    manual: 'bg-slate-100 text-slate-800',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[frequency]}`}>
      {t('projectDetail.frequency' + frequency.charAt(0).toUpperCase() + frequency.slice(1))}
    </span>
  )
}

function SectionCard({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// --- Render helpers per section ---

function BasicInfoContent({ project }: { project: BlogProject }) {
  const { t } = useTranslation()
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FieldDisplay label={t('projectBranding.fieldName')} value={project.name} />
      <FieldDisplay label={t('projectBranding.fieldBlogUrl')} value={project.blog_url} isUrl />
      <FieldDisplay label={t('projectBranding.fieldSitemapUrl')} value={project.sitemap_url} isUrl />
      <div className="sm:col-span-2">
        <FieldDisplay label={t('projectBranding.fieldDescription')} value={project.description} />
      </div>
    </dl>
  )
}

function ScrapingContent({ project }: { project: BlogProject }) {
  const { t, i18n } = useTranslation()
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1">
        <dt className="text-sm font-medium text-muted-foreground">{t('projectBranding.fieldScrapingFrequency')}</dt>
        <dd><FrequencyBadge frequency={project.scraping_frequency} /></dd>
      </div>
      <div className="space-y-1">
        <dt className="text-sm font-medium text-muted-foreground">{t('projectBranding.fieldCreatedAt')}</dt>
        <dd className="text-sm">{formatDate(project.created_at)}</dd>
      </div>
    </dl>
  )
}

// --- Main component ---

function ProjectDetail() {
  const { t } = useTranslation()
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const { data: project, isLoading, error } = useBlogProject(projectId)
  const navigate = useNavigate()

  const [editSection, setEditSection] = useState<SectionKey | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const activeSection = SECTIONS.find((s) => s.key === editSection)

  const handleDeleted = () => {
    clearStoredProjectId()
    navigate({ to: '/dashboard' })
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('projectDetail.breadcrumbDashboard'), href: '/dashboard' },
          { label: project?.name || t('projectDetail.breadcrumbProject') },
        ]}
        title={project?.name || t('projectDetail.breadcrumbProject')}
        actions={
          project ? (
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => setDeleteDialogOpen(true)}
            >
              {t('common.delete')}
            </Button>
          ) : undefined
        }
      />
      <PageLayout maxWidth="medium" isLoading={isLoading} error={error ?? null}>
        {project && (
          <div className="space-y-6">
            {/* Basic Info */}
            <SectionCard
              title={t('projectBranding.sectionBasicInfo')}
              onEdit={() => setEditSection('basicInfo')}
            >
              <BasicInfoContent project={project} />
            </SectionCard>

            {/* Scraping */}
            <SectionCard
              title={t('projectBranding.sectionScraping')}
              onEdit={() => setEditSection('scraping')}
            >
              <ScrapingContent project={project} />
            </SectionCard>

            {/* Gemini API Key */}
            <GeminiApiKeyCard blogProjectId={projectId} />

            {/* Pinterest Connection */}
            <PinterestConnection
              blogProjectId={projectId}
              pinterestConnected={search.pinterest_connected === 'true'}
              pinterestError={search.pinterest_error}
            />
          </div>
        )}
      </PageLayout>

      {/* Section edit dialog */}
      {project && activeSection && (
        <ProjectSectionDialog
          open={!!editSection}
          onOpenChange={(open) => {
            if (!open) setEditSection(null)
          }}
          project={project}
          title={t(activeSection.titleKey)}
          fields={activeSection.fields}
        />
      )}

      {/* Delete dialog */}
      {project && (
        <DeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          project={project}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )
}
