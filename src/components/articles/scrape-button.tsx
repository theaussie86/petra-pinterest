import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useScrapeBlog } from '@/lib/hooks/use-articles'

interface ScrapeButtonProps {
  blogProjectId: string
  blogUrl: string
  rssUrl: string | null
}

export function ScrapeButton({ blogProjectId, blogUrl, rssUrl }: ScrapeButtonProps) {
  const scrapeMutation = useScrapeBlog()
  const [showSuccess, setShowSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Handle success state with timeout
  useEffect(() => {
    if (scrapeMutation.isSuccess && !showSuccess) {
      setShowSuccess(true)
      setErrorMessage(null)
      const timer = setTimeout(() => {
        setShowSuccess(false)
        scrapeMutation.reset()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [scrapeMutation.isSuccess, showSuccess, scrapeMutation])

  // Handle error state
  useEffect(() => {
    if (scrapeMutation.isError) {
      setErrorMessage('Failed to scrape blog. Check your blog URL and try again.')
    } else {
      setErrorMessage(null)
    }
  }, [scrapeMutation.isError])

  const handleClick = () => {
    setErrorMessage(null)
    scrapeMutation.mutate({
      blog_project_id: blogProjectId,
      blog_url: blogUrl,
      rss_url: rssUrl,
    })
  }

  const getResultSummary = () => {
    if (!scrapeMutation.data) return ''
    const { articles_created, articles_updated } = scrapeMutation.data
    return `${articles_created} new, ${articles_updated} updated`
  }

  return (
    <div>
      <Button
        onClick={handleClick}
        disabled={scrapeMutation.isPending}
        variant="default"
        size="sm"
        className={showSuccess ? 'bg-green-600 hover:bg-green-700' : ''}
      >
        {scrapeMutation.isPending && (
          <>
            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            Scraping...
          </>
        )}
        {showSuccess && (
          <>
            <CheckCircle className="h-4 w-4 mr-1" />
            {getResultSummary()}
          </>
        )}
        {!scrapeMutation.isPending && !showSuccess && (
          <>
            <RefreshCw className="h-4 w-4 mr-1" />
            Scrape Blog
          </>
        )}
      </Button>
      {errorMessage && (
        <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
      )}
    </div>
  )
}
