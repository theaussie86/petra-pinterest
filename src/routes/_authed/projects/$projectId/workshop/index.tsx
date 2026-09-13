import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { WorkshopView } from '@/components/workshop/workshop-view'
import { getArticlesByProject } from '@/lib/api/articles'
import { blogProjectQueryOptions } from '@/lib/query/blog-projects'
import { pinTemplateCountsQueryOptions } from '@/lib/query/pin-templates'

export const Route = createFileRoute('/_authed/projects/$projectId/workshop/')({
  // Prefetch the article list, the per-article template counts, and the project
  // (its domain is the overlay footer) server-side so the left column and detail
  // arrive in the SSR HTML. Templates for the selected article load client-side
  // once a selection is made.
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ['articles', params.projectId],
        queryFn: () => getArticlesByProject(params.projectId),
      }),
      context.queryClient.ensureQueryData(pinTemplateCountsQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(blogProjectQueryOptions(params.projectId)),
    ]),
  component: WorkshopPage,
})

function WorkshopPage() {
  const { projectId } = Route.useParams()
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t('workshop.title')} description={t('workshop.description')} />
      <PageLayout maxWidth="full">
        <WorkshopView projectId={projectId} />
      </PageLayout>
    </>
  )
}
