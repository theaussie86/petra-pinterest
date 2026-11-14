---
status: accepted
---

# Extract scraped articles with Mozilla Readability instead of Gemini

The `scrape_article` worker no longer asks Gemini to turn a page into an article. `supabase/functions/_shared/extract-article.ts` parses the HTML with `npm:linkedom`, lets `npm:@mozilla/readability` find the main content, converts it to Markdown with `npm:turndown` and reads the date from Readability or the page metadata (meta tags, JSON-LD `datePublished`, `<time datetime>`). The motivation: every scraped article cost Gemini tokens on the project's BYOK key (with `medium` thinking, issue #71), and a project without a key or without credit could not scrape at all. Readability is the extraction Firefox Reader View uses; for blog posts it is good enough and costs nothing.

## Considered options

- **Keep Gemini (rejected).** Works, but ties a basic import step to key and credit, and a first import of a large blog burns tokens for what is mostly boilerplate removal.
- **The KI-free scraper we had until February 2026 (not revived).** It used `node-html-parser` and was dropped as "fragile". The fragile part was mainly the discovery chain (sitemap, then RSS, then HTML link crawling), not the per-article extraction. Today's sitemap discovery (`scrape-blog.ts`) stays as it is; only the extraction per article changes, and it uses Readability instead of hand-written selectors.
- **`deno-dom` instead of linkedom (not chosen).** linkedom loads as a plain `npm:` package in Deno and under vitest, so the same module is tested in Node and deployed to the Edge runtime.

## Consequences

- **Scraping needs no Gemini key and no credit.** The worker does not call `get_gemini_api_key` any more. The key is only needed for pin metadata generation (ADR-0002 still applies there). UI texts on the key card say so.
- **No article, no upsert.** If Readability returns nothing or fewer than 250 characters of text, `NoArticleFoundError` is thrown. The queue retries and mails after the last attempt, as for any other failure (ADR-0004).
- **Content shape stays Markdown.** Headings, lists, links and emphasis survive; images, figures, embeds and forms are dropped. Gemini wrote an `excerpt` and `author` that were never stored; nothing is lost there.
- **Quality depends on page markup.** Pages without a recognisable main content block (heavy page builders, listing pages, legal pages) now fail instead of being summarised by the model.
- **`generateArticleFromHtml`, `scrapedArticleSchema`, `ARTICLE_SCRAPER_SYSTEM_PROMPT` and `ARTICLE_THINKING_LEVEL` are gone** from `_shared/ai.ts`.
