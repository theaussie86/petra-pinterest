import { parse } from 'node-html-parser'
import { generateArticleFromHtml, type ScrapedArticle } from '../../src/lib/gemini/client'

/**
 * Clean HTML to reduce token usage and noise.
 * Removes scripts, styles, SVGs, and comments.
 */
function cleanHtml(html: string): string {
  const root = parse(html)

  // Remove scripts, styles, svg
  root.querySelectorAll('script, style, svg, link, meta, noscript').forEach((el) => el.remove())

  // Remove comments (node-html-parser doesn't support comment removal easily via querySelector, 
  // but removing tags does a lot of heavy lifting)

  // Get body content or fallback to html
  const body = root.querySelector('body')
  return body ? body.innerHTML : root.innerHTML
}

/**
 * Fetch HTML from a URL with basic error handling
 */
async function fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PetraPinterestBot/1.0; +http://localhost:3000)'
        }
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
    }

    return await response.text()
}

/**
 * Main function to scrape an article using standard fetch + Gemini extraction
 */
export async function scrapeArticleWithGemini(url: string): Promise<ScrapedArticle & { url: string }> {
    console.log(`[GeminiScraper] Fetching ${url}...`)
    const html = await fetchHtml(url)

    console.log(`[GeminiScraper] Cleaning HTML (${html.length} chars)...`)
    const cleanedHtml = cleanHtml(html)
    console.log(`[GeminiScraper] Cleaned HTML (${cleanedHtml.length} chars). Sending to Gemini...`)

    const article = await generateArticleFromHtml(cleanedHtml, url)
    console.log(`[GeminiScraper] Successfully extracted: ${article.title}`)

    return {
        ...article,
        url
    }
}
