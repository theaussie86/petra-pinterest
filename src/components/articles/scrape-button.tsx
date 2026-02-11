import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useScrapeBlog } from '@/lib/hooks/use-articles'

interface ScrapeButtonProps {
  blogProjectId: string
  blogUrl: string
  sitemapUrl: string | null
}

export function ScrapeButton({ blogProjectId, blogUrl, sitemapUrl }: ScrapeButtonProps) {
  const { t } = useTranslation()
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
      setErrorMessage(t('scrapeButton.errorScrapeFailed'))
    } else {
      setErrorMessage(null)
    }
  }, [scrapeMutation.isError, t])

  const handleClick = () => {
    setErrorMessage(null)
    scrapeMutation.mutate({
      blog_project_id: blogProjectId,
      blog_url: blogUrl,
      sitemap_url: sitemapUrl,
    })
  }

  const getResultSummary = () => {
    if (!scrapeMutation.data) return ''
    return t('scrapeButton.scrapeStarted')
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
            {t('scrapeButton.scraping')}
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
            {t('scrapeButton.scrapeBlog')}
          </>
        )}
      </Button>
      {errorMessage && (
        <p className="text-sm text-red-600 mt-2">{errorMessage}</p>
      )}
    </div>
  )
}
