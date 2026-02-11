import { Link } from '@tanstack/react-router'
import { Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BlogProject } from '@/types/blog-projects'

interface ProjectCardProps {
  project: BlogProject
  onEdit: (project: BlogProject) => void
  onDelete: (project: BlogProject) => void
  stats?: { articles: number; scheduled: number; published: number }
  statsLoading?: boolean
}

export function ProjectCard({ project, onEdit, onDelete, stats, statsLoading }: ProjectCardProps) {
  const displayStats = stats ?? { articles: 0, scheduled: 0, published: 0 }

  return (
    <Link to="/projects/$id" params={{ id: project.id }}>
      <Card className="cursor-pointer transition-all hover:shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-900 truncate">{project.name}</h3>
            </div>
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <a
              href={project.blog_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-600 truncate"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="truncate">{project.blog_url}</span>
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-4">
              <div>
                {statsLoading ? (
                  <Skeleton className="inline-block h-4 w-4 align-middle" />
                ) : (
                  <span className="font-medium text-slate-900">{displayStats.articles}</span>
                )}
                <span className="text-slate-500 ml-1">articles</span>
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="inline-block h-4 w-4 align-middle" />
                ) : (
                  <span className="font-medium text-slate-900">{displayStats.scheduled}</span>
                )}
                <span className="text-slate-500 ml-1">scheduled</span>
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="inline-block h-4 w-4 align-middle" />
                ) : (
                  <span className="font-medium text-slate-900">{displayStats.published}</span>
                )}
                <span className="text-slate-500 ml-1">published</span>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onEdit(project)
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete(project)
            }}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  )
}
