import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()

    // 1. Query projects with automatic scraping enabled
    const { data: projects, error: queryError } = await supabase
      .from('blog_projects')
      .select('id, tenant_id, name, scraping_frequency')
      .in('scraping_frequency', ['daily', 'weekly'])

    if (queryError) {
      throw new Error(`Failed to query projects: ${queryError.message}`)
    }

    if (!projects || projects.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No projects with automatic scraping configured',
          dispatched: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 2. Filter to projects due today
    const isSunday = new Date().getUTCDay() === 0
    const dueProjects = projects.filter((p) => {
      if (p.scraping_frequency === 'daily') return true
      if (p.scraping_frequency === 'weekly') return isSunday
      return false
    })

    console.log(
      `[scrape-scheduled] ${projects.length} configured, ${dueProjects.length} due today ` +
        `(Sunday: ${isSunday})`,
    )

    if (dueProjects.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No projects due for scraping today',
          dispatched: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. Invoke scrape-blog for each due project (sequentially to avoid Gemini API overload)
    const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const results: Array<{
      project_id: string
      project_name: string
      success: boolean
      detail?: unknown
      error?: string
    }> = []

    for (const project of dueProjects) {
      try {
        console.log(
          `[scrape-scheduled] Dispatching scrape-blog for "${project.name}" (${project.id})`,
        )

        const res = await fetch(
          `${projectUrl}/functions/v1/scrape-blog`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              blog_project_id: project.id,
              tenant_id: project.tenant_id,
            }),
          },
        )

        const body = await res.json()

        results.push({
          project_id: project.id,
          project_name: project.name,
          success: res.ok && body.success,
          detail: body,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        console.error(
          `[scrape-scheduled] Error for "${project.name}":`,
          message,
        )
        results.push({
          project_id: project.id,
          project_name: project.name,
          success: false,
          error: message,
        })
      }
    }

    const succeeded = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: dueProjects.length,
        succeeded,
        failed,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[scrape-scheduled] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
