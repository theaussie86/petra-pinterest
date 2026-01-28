---
created: 2026-01-28T09:57
title: Use sitemap instead of RSS for blog scraping
area: api
files:
  - server/lib/scraping.ts
  - src/lib/server/scraping.ts
---

## Problem

Currently the blog scraping flow uses RSS feed URLs to discover blog articles. RSS feeds may be incomplete, missing, or inconsistently formatted across blog platforms. Sitemaps (sitemap.xml) are more universally available, provide structured XML with all published URLs, and are a standard that virtually every blog/CMS generates automatically.

Switching to sitemap-based discovery would:
- Improve article coverage (sitemaps typically list all pages, RSS often limits to recent N)
- Provide structured XML that parses reliably with existing XML parsing tools (fast-xml-parser already in use)
- Eliminate RSS auto-discovery fallback logic
- Allow parsing `<lastmod>` dates for incremental scraping

## Solution

- Replace RSS discovery with sitemap.xml fetch and parse
- Parse sitemap XML to extract `<loc>` URLs (and optionally `<lastmod>`, `<changefreq>`)
- Filter URLs to identify blog article pages (vs. category/tag/author pages)
- Feed individual article URLs into existing single-URL scrape pipeline
- Consider supporting sitemap index files (`<sitemapindex>`) that reference multiple sitemaps
- Update `blog_projects` table: replace `rss_feed_url` field with `sitemap_url` (or support both)
- TBD: Whether to keep RSS as fallback or fully replace
