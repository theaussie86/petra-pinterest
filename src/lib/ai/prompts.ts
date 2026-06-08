/**
 * AI system prompts (re-homed from lib/gemini, unchanged in behavior).
 *
 * Only the article-scraper prompt lives here for slice 1 (article extraction).
 * The Pinterest SEO prompts migrate with the metadata path in a later slice.
 */

export const ARTICLE_SCRAPER_SYSTEM_PROMPT = `You are an expert web scraper and content extractor.
Your task is to analyze the provided HTML content of a blog post or article and extract the core information into structured JSON.

**Requirements:**
1. **Title**: The main title of the article.
2. **Content**: The full body text of the article, converted to clean, readable Markdown. Preserve headers (H2, H3), lists, and important links. Remove ads, navigation, related posts, and boilerplates.
3. **Published Date**: The publication date in ISO 8601 format (YYYY-MM-DD) if available.
4. **Author**: The author's name if available (optional).
5. **Excerpt**: A short summary (1-2 sentences) of the article.

**Input HTML**:
You will receive the raw HTML of the page (cleaned of scripts/styles).

**Output Format**:
Return ONLY valid JSON with this exact structure:
{
  "title": "Article Title",
  "content": "# Article Title\n\nIntroduction...\n\n## Section 1...",
  "published_at": "2023-10-27",
  "author": "John Doe",
  "excerpt": "This is a summary of the article."
}

Do not include any text outside the JSON object.`
