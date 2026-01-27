import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ExternalLink, FileText, Pin, ArrowLeft } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { useBlogProject, useDeleteBlogProject } from '@/lib/hooks/use-blog-projects'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'

export const Route = createFileRoute('/_authed/projects/$id')({
  component: ProjectDetail,
})

function ProjectDetail() {
  const { user } = Route.useRouteContext()
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: project, isLoading, error } = useBlogProject(id)
  const deleteMutation = useDeleteBlogProject()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          </div>
        </main>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <p className="text-slate-600">Project not found</p>
            <Link to="/dashboard">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const handleDeleteSuccess = async () => {
    setDeleteDialogOpen(false)
    await navigate({ to: '/dashboard' })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getFrequencyBadge = (frequency: 'daily' | 'weekly' | 'manual') => {
    const colors = {
      daily: 'bg-green-100 text-green-800',
      weekly: 'bg-blue-100 text-blue-800',
      manual: 'bg-slate-100 text-slate-800',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[frequency]}`}>
        {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Back navigation */}
        <div className="mb-6">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Project header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">{project.name}</h1>
          <div className="flex flex-col gap-2 text-slate-600">
            <a
              href={project.blog_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:underline w-fit"
            >
              {project.blog_url}
              <ExternalLink className="h-4 w-4" />
            </a>
            <div className="flex items-center gap-4 text-sm">
              <span>Created {formatDate(project.created_at)}</span>
              <span>•</span>
              <span>Scraping: {getFrequencyBadge(project.scraping_frequency)}</span>
            </div>
            {project.rss_url && (
              <div className="text-sm">
                <span className="text-slate-500">RSS:</span>{' '}
                <a
                  href={project.rss_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {project.rss_url}
                </a>
              </div>
            )}
            {!project.rss_url && (
              <div className="text-sm text-slate-500">RSS: Not configured</div>
            )}
            {project.description && (
              <p className="text-sm mt-2">{project.description}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          <Button onClick={() => setEditDialogOpen(true)}>Edit Project</Button>
          <Button
            variant="outline"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Delete Project
          </Button>
        </div>

        {/* Content sections */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Articles placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-400" />
                Articles
              </CardTitle>
              <CardDescription>Blog posts from your RSS feed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">
                  Articles will appear here once blog scraping is set up
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pins placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pin className="h-5 w-5 text-slate-400" />
                Pins
              </CardTitle>
              <CardDescription>Pinterest content for this blog</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Pin className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">
                  Pins will appear here once you start creating content
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dialogs */}
        <ProjectDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open)
            if (!open) {
              // Optional: refresh data after edit
            }
          }}
          project={project}
        />
        <DeleteDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open && !deleteMutation.isPending) {
              handleDeleteSuccess()
            }
          }}
          project={project}
        />
      </main>
    </div>
  )
}
