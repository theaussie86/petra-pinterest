# Phase 3: Blog Scraping & Articles - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated blog scraping (RSS with HTML fallback) and article management per blog project. Users can view, filter, and manually add articles. Pinterest board display is deferred to Phase 4 — boards will be fetched live from Pinterest via n8n when needed (no local board storage).

**Revised scope vs roadmap:** Success criterion #5 (Pinterest boards synced via n8n) moves to Phase 4. Phase 3 is purely scraping + articles.

</domain>

<decisions>
## Implementation Decisions

### Article list display
- Table rows layout (not cards) — information-dense, consistent with dashboard patterns
- Columns: Title, Date, Status, Pin Count, URL — full info visible without clicking into detail
- Sortable columns — click column headers to sort by title, date, status, or pin count
- Default sort: newest first (publish date descending)

### Article detail page
- Metadata header + content below (single column layout)
- Header section shows: title, publish date, source URL, pin count
- Full scraped article content rendered below the header

### Scraping mechanism
- RSS feed first, HTML scraping fallback
- Try blog's RSS/Atom feed (using RSS URL from blog_projects if set, otherwise auto-discover)
- If RSS unavailable or incomplete, fall back to HTML scraping of blog index page

### Scraping behavior & feedback
- Inline progress in the UI — scrape button changes to progress state showing real-time updates
- On re-scrape: update existing articles (re-fetch content in case blog posts were edited), plus add any new ones
- Errors shown inline near the scrape button — e.g., "RSS feed not found. Check blog URL or add RSS URL manually."

### Manual article addition
- Users can manually add an article by entering a URL
- App auto-scrapes the provided URL to extract title, date, and content
- Appears in the same article list as scraped articles

### Article deletion
- Soft delete (archive) — articles are hidden, not truly deleted
- Archived articles can be restored
- Pins stay linked to archived articles (relevant for Phase 4+)

### Article status
- No explicit status workflow for articles — articles are data records
- Filtering and workflow logic happens at the pin level (Phase 4)

### Board sync approach (architecture decision for Phase 4+)
- No local boards table — fetch boards live from Pinterest via n8n API call
- Board picker is a dropdown that calls Pinterest on demand
- Project gets a default board setting (board_id stored on blog_projects)
- Pin creation pre-fills default board but allows override
- All board UI deferred to Phase 4

### Claude's Discretion
- RSS auto-discovery implementation details
- HTML scraping extraction logic and selectors
- Exact inline progress UI design
- Table pagination or infinite scroll for large article lists
- Content sanitization and rendering approach

</decisions>

<specifics>
## Specific Ideas

- User wants to be able to re-scrape and get updated content for existing articles, not just skip duplicates
- Board data should come fresh from Pinterest API each time, not stored locally — reduces sync complexity
- Each project has a default board (deferred to Phase 4 but architecture noted here)
- Manual article add should feel the same as scraped articles — auto-extract content from URL

</specifics>

<deferred>
## Deferred Ideas

- Pinterest board picker on project detail page — Phase 4 (Pin Management)
- Default board per project — Phase 4 (part of pin creation workflow)
- Board display grouped by project — Phase 4 (replaced by live fetch approach)
- Roadmap success criterion #5 (board sync) — moved to Phase 4

</deferred>

---

*Phase: 03-blog-scraping-articles*
*Context gathered: 2026-01-27*
