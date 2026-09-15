import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { notifyProjectError } from '../_shared/notifications.ts'
import { discoverAndEnqueueBlogScrape, type ScrapeBlogJob } from '../_shared/scrape-blog.ts'
import { runQueueWorker } from '../_shared/queue-worker.ts'

// Drains the scrape_blog queue. Kicked by pg_cron only when messages are
// waiting (ADR-0004, issue #91). Each message discovers the sitemap, diffs
// new + changed articles and batch-enqueues them into scrape_article. A message
// is retried up to 2 times; only after the last failed attempt is it archived
// and a single project error mail sent.
Deno.serve(async () => {
  const supabase = createServiceClient()

  try {
    const result = await runQueueWorker<ScrapeBlogJob>({
      supabase,
      queue: 'scrape_blog',
      maxAttempts: 2,
      process: (job) => discoverAndEnqueueBlogScrape(supabase, job),
      onFinalFailure: async (job, errorMessage) => {
        await notifyProjectError({
          supabase,
          projectId: job.blog_project_id,
          subject: '[Pinfinity] Fehler beim Blog-Scan',
          errorMessage,
        })
      },
    })

    return Response.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[scrape-blog-worker] Error:', message)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
})
