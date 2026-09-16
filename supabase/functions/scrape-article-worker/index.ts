import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { notifyProjectError } from '../_shared/notifications.ts'
import { scrapeAndStoreArticle, type ScrapeArticleJob } from '../_shared/scrape-article.ts'
import { runQueueWorker } from '../_shared/queue-worker.ts'

// Drains the scrape_article queue. Kicked by pg_cron only when messages are
// waiting (ADR-0004, issue #90). A message is retried up to 3 times; only after
// the last failed attempt is it archived and a single project error mail sent.
Deno.serve(async () => {
  const supabase = createServiceClient()

  try {
    const result = await runQueueWorker<ScrapeArticleJob>({
      supabase,
      queue: 'scrape_article',
      maxAttempts: 3,
      process: (job) => scrapeAndStoreArticle(supabase, job),
      onFinalFailure: async (job, errorMessage) => {
        await notifyProjectError({
          supabase,
          projectId: job.blog_project_id,
          subject: '[Pinfinity] Fehler beim Artikel-Scraping',
          errorMessage,
          context: `URL: ${job.url}`,
        })
      },
    })

    return Response.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[scrape-article-worker] Error:', message)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
})
