import { useCallback } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useBlogProjects } from './use-blog-projects'

const STORAGE_KEY = 'pinma-active-project'

function getStoredProjectId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function storeProjectId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // localStorage unavailable (SSR, private mode)
  }
}

export function clearStoredProjectId() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // noop
  }
}

export function useActiveProject() {
  const navigate = useNavigate()
  const { data: projects } = useBlogProjects()

  // Extract projectId from URL: /projects/$projectId/...
  const location = useRouterState({ select: (s) => s.location })
  const match = location.pathname.match(/\/projects\/([^/]+)/)
  const urlProjectId = match?.[1] ?? null

  // Priority: URL > localStorage > first project
  const storedId = getStoredProjectId()
  const firstProjectId = projects?.[0]?.id ?? null

  const activeProjectId = urlProjectId ?? storedId ?? firstProjectId

  // Keep localStorage in sync with URL
  if (urlProjectId && urlProjectId !== storedId) {
    storeProjectId(urlProjectId)
  }

  const setActiveProject = useCallback(
    (id: string, currentSection?: string) => {
      storeProjectId(id)
      // Navigate to the same section for the new project
      if (currentSection) {
        navigate({ to: `/projects/${id}/${currentSection}` as any })
      } else {
        navigate({ to: '/projects/$projectId', params: { projectId: id } } as any)
      }
    },
    [navigate]
  )

  return {
    activeProjectId,
    setActiveProject,
    projects,
  }
}
