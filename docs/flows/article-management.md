# Article Management Flow

Blog scraping, manual article addition, content editing, and archive/restore. Articles are scraped from blog sitemaps using Gemini-based extraction and stored for linking to pins.

## Bulk Scrape

```mermaid
sequenceDiagram
    actor User
    participant Button as ScrapeButton
    participant Server as scrapeBlogFn
    participant Sitemap as discoverSitemapUrls()
    participant DB as blog_articles
    participant Edge as scrape-single Edge Function
    participant Gemini as Gemini API

    User->>Button: Click "Scrape Blog"
    Button->>Server: scrapeBlogFn({ blog_project_id, blog_url, sitemap_url })
    Server->>Sitemap: Discover URLs from sitemap XML
    Sitemap-->>Server: string[] of blog post URLs
    Server->>DB: Fetch existing article URLs for project
    DB-->>Server: Existing URLs
    Server->>Server: Diff: new URLs = discovered - existing

    loop Each new URL (concurrency: 5)
        Server->>Edge: invoke('scrape-single', { url, blog_project_id, tenant_id })
        Edge->>Edge: Fetch HTML, strip non-content tags
        Edge->>Gemini: Extract title, content, published_at
        Gemini-->>Edge: Structured article data
        Edge->>DB: Upsert article (ON CONFLICT blog_project_id, url)
    end

    Server-->>Button: { success: true, dispatched: N }
    Button->>Button: Show green checkmark for 3s
```

The server function returns immediately after dispatching to Edge Functions (fire-and-forget). New articles appear via Supabase Realtime subscription on the articles table.

## Manual Add

```mermaid
flowchart TD
    A[Articles page: Click 'Add Article'] --> B[AddArticleDialog opens]
    B --> C[User enters URL]
    C --> D[Submit]
    D --> E[Zod validation:<br/>valid http/https URL]
    E -->|Invalid| F[Show error]
    E -->|Valid| G[scrapeSingleFn invoked]
    G --> H[Edge Function scrapes URL asynchronously]
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
| `server/lib/scraping.ts` | Sitemap discovery: `discoverSitemapUrls()` |
| `src/lib/api/articles.ts` | API: CRUD, archive/restore, content update |
| `src/lib/hooks/use-articles.ts` | TanStack Query hooks with realtime invalidation |
