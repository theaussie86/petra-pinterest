# Article Management Flow

Blog scraping, manual article addition, content editing, and archive/restore. Articles are scraped from blog sitemaps, extracted with Mozilla Readability (no AI, no Gemini key needed, ADR-0008) and stored for linking to pins.

## Bulk Scrape

```mermaid
sequenceDiagram
    actor User
    participant Button as ScrapeButton
    participant Server as scrapeBlogFn
    participant Queue as pgmq scrape_blog / scrape_article
    participant BlogWorker as scrape-blog-worker
    participant ArticleWorker as scrape-article-worker
    participant DB as blog_articles

    User->>Button: Click "Scrape Blog"
    Button->>Server: scrapeBlogFn({ blog_project_id, blog_url, sitemap_url })
    Server->>Queue: rpc enqueue_scrape_blog (tenant-checked)
    Server-->>Button: { success: true, dispatched: 1 }
    Button->>Button: Show green checkmark for 3s

    Note over Queue,BlogWorker: pg_cron kicks the worker every minute
    Queue->>BlogWorker: scrape_blog message
    BlogWorker->>BlogWorker: Discover sitemap URLs with lastmod
    BlogWorker->>BlogWorker: Drop legal/utility pages (Impressum, AGB, Datenschutz, ...)
    BlogWorker->>DB: Fetch existing articles for project (incl. archived)
    BlogWorker->>Queue: queue_send_batch new + changed URLs into scrape_article

    loop Each scrape_article message
        Queue->>ArticleWorker: { url, blog_project_id, tenant_id }
        ArticleWorker->>ArticleWorker: Fetch HTML, parse DOM (linkedom)
        ArticleWorker->>ArticleWorker: Readability: title + main content, HTML to Markdown (Turndown)
        ArticleWorker->>ArticleWorker: published_at from Readability, else meta tag, JSON-LD, time element
        ArticleWorker->>DB: Upsert article (ON CONFLICT blog_project_id, url)
    end
```

The server function returns immediately after enqueueing (fire-and-forget). New articles appear via Supabase Realtime subscription on the articles table.

### Article extraction

`supabase/functions/_shared/extract-article.ts` runs per article, without AI and without the project's Gemini key (ADR-0008):

- **DOM:** `npm:linkedom` (the Edge runtime has no `DOMParser`). A `<base>` with the article URL is injected so relative links become absolute.
- **Content:** `npm:@mozilla/readability` picks the main content and drops navigation, sidebar, footer and cookie banners. `npm:turndown` converts it to Markdown; headings, lists, links and emphasis stay, images, figures, embeds and forms are dropped.
- **Title:** Readability's title; if the page has exactly one `<h1>` contained in that title, the `<h1>` wins (strips the " - Blog name" suffix).
- **Date:** Readability `publishedTime`, else `article:published_time` and similar meta tags, else JSON-LD `datePublished` (also inside `@graph`), else the first `<time datetime>`. `parsePublishedAt` turns it into ISO or `null`.
- **No article:** if Readability returns nothing or under 250 characters of text, `NoArticleFoundError` is thrown and nothing is upserted. The queue retries and mails after the last attempt like any other failure.

### Skipped sitemap URLs

`supabase/functions/_shared/url-filter.ts` drops legal and utility pages before the diff: Impressum, Datenschutz/Privacy, AGB/Terms, Widerruf, Cookie pages, Kontakt, Warenkorb/Checkout/Mein Konto, Versand, newsletter confirmation and thank-you pages. Many sites stamp these with the build time as `lastmod`, so without the filter they came back as "updated" on every scan, Readability found no article, and each one ended in an error mail. Only the last segment of paths with at most two segments is matched (`/impressum`, `/de/impressum`), so article slugs like `/datenschutz-fuer-blogger` stay in. Taxonomy and product pages (`/tag/`, `/category/`, `/produkt-kategorie/`, `/products/`) are not filtered because some pins link to them. Already stored legal pages remain in `blog_articles`; they are simply no longer re-scraped.

> **Note:** The duplicate check queries all articles for the project **including archived ones** (no `archived_at` filter). This ensures archived articles are not re-scraped. If an archived article's `lastmod` in the sitemap is newer than its `scraped_at`, it will be re-scraped and updated in place — but it remains archived.

## Manual Add

```mermaid
flowchart TD
    A[Articles page: Click 'Add Article'] --> B[AddArticleDialog opens]
    B --> C[User enters URL]
    C --> D[Submit]
    D --> E[Zod validation:<br/>valid http/https URL]
    E -->|Invalid| F[Show error]
    E -->|Valid| G[scrapeSingleFn invoked]
    G --> H[RPC enqueues scrape_article,<br/>scrape-article-worker scrapes URL]
    H --> I[Close dialog]
    I --> J[Toast: Article added]
    J --> K[Article appears via Realtime]
```

## Content Editing

```mermaid
flowchart TD
    A[Article detail page] --> B[Click 'Edit Content']
    B --> C[isEditing = true]
    C --> D[Textarea shows raw HTML content]
    D --> E[User modifies content]
    E --> F[Click Save]
    F --> G[Confirmation dialog:<br/>'Are you sure?']
    G -->|Cancel| D
    G -->|Confirm| H[useUpdateArticleContent mutation]
    H --> I[Supabase UPDATE content]
    I -->|Success| J[Exit edit mode]
    I -->|Error| K[Toast: Update failed]
```

Content is rendered via `sanitizeHtml()` + `dangerouslySetInnerHTML` in view mode. The textarea uses monospace font for HTML editing.

## Archive / Restore

Articles use soft deletion via the `archived_at` timestamp column:

```mermaid
flowchart LR
    A[Active article<br/>archived_at = null] -->|Archive| B[Archived article<br/>archived_at = timestamp]
    B -->|Restore| A
```

- **Archive:** Sets `archived_at = NOW()`, article hidden from active list
- **Restore:** Sets `archived_at = null`, article returns to active list
- Articles are never hard-deleted
- **Pin creation:** Archived articles are excluded from the article selector (uses `archived_at IS NULL` filter)
- **Existing pins:** Pins linked to an archived article keep their reference — the article link on the pin detail page still works

The articles table has two tabs: "Active" (default) and "Archived". Both show title, date, pin count, source URL, and an action button (Archive or Restore).

## Articles Table Features

- **Sortable columns:** title, published_at, pin_count (derived), URL domain
- **Pin count badges:** Aggregated from the pins table per article
- **Realtime updates:** Listens for INSERT events to auto-refresh when scraping completes
- **Link to detail:** Clicking an article title navigates to the detail page

## Article Detail Page

Displays article metadata, content, and linked pins:

- **Metadata:** Published date, scraped date, pin count
- **Linked pins:** Up to 5 pins shown with "Load More" pagination
- **Content:** Sanitized HTML rendering with edit toggle
- **Actions:** Edit content, view original (external link), archive/restore

## Key Files

| File | Purpose |
|------|---------|
| `src/components/articles/scrape-button.tsx` | Bulk scrape trigger with loading/success/error states |
| `src/components/articles/add-article-dialog.tsx` | Manual URL input with Zod validation |
| `src/components/articles/articles-table.tsx` | Sortable table with active/archived tabs |
| `src/routes/_authed/projects/$projectId/articles/index.tsx` | Articles list page |
| `src/routes/_authed/projects/$projectId/articles/$articleId.tsx` | Article detail with content editing |
| `src/lib/server/scraping.ts` | Server functions: `scrapeBlogFn`, `scrapeSingleFn` |
| `supabase/functions/_shared/scrape-blog.ts` | Sitemap discovery + fan-out into `scrape_article` |
| `supabase/functions/_shared/scrape-article.ts` | Single-article scrape pipeline |
| `supabase/functions/_shared/extract-article.ts` | Readability extraction: title, Markdown content, published_at |
| `src/lib/api/articles.ts` | API: CRUD, archive/restore, content update |
| `src/lib/hooks/use-articles.ts` | TanStack Query hooks with realtime invalidation |
