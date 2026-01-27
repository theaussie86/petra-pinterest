---
status: complete
phase: 03-blog-scraping-articles
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-01-27T20:00:00Z
updated: 2026-01-27T20:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. View Articles List on Project Detail
expected: Navigate to a blog project detail page. Below the project metadata, you should see an articles section with a table. If no articles exist yet, an empty state message should appear. The table has columns: Title, Date, Pin Count, and URL.
result: pass

### 2. Scrape Blog Articles
expected: On the project detail page, click the "Scrape Blog" button. The button should show a loading spinner with "Scraping..." text and be disabled during the operation. After completion, the button should briefly turn green showing a result summary (e.g., "5 new, 2 updated") before reverting to normal. Scraped articles should appear in the table.
result: issue
reported: "I added my sitemap url, because this is what I used in the n8n automation and it worked great. And every blog has it, while a rss feed needs to be setup if I'm not mistaken. Change the scraping to work with the sitemap for example: https://himmelstraenen.de/post-sitemap.xml"
severity: major

### 3. Manually Add Article by URL
expected: On the project detail page, click the "Add Article" button. A dialog should open with a URL input field. Enter a valid article URL (starting with http:// or https://) and submit. The dialog should close on success, and the new article should appear in the articles table. Invalid URLs should show a validation error.
result: issue
reported: "adding a single article doesn't work either. I think it should trigger a supabase edge function but that is blocked by CORS. We should proxy that through the server and authenticate with our secret key server side."
severity: blocker

### 4. Sort Articles Table
expected: Click on column headers (Title, Date, URL) in the articles table. Clicking a header should sort articles by that column. Clicking again should toggle between ascending and descending. An arrow icon should indicate the current sort direction.
result: skipped
reason: No articles available to test sorting (blocked by issues 2 and 3)

### 5. View Article Detail Page
expected: In the articles table, click on an article title. You should navigate to an article detail page showing: the article title, publication date, source URL, and the full scraped content rendered with professional typography. A "Back" link should return to the project detail page.
result: skipped
reason: No articles available to test detail page (blocked by issues 2 and 3)

### 6. Archive an Article
expected: In the articles table, find the action menu (dropdown) on an article row. Click "Archive". The article should disappear from the active articles list. Switch to the "Archived" tab — the article should appear there.
result: skipped
reason: No articles available to test archiving (blocked by issues 2 and 3)

### 7. Restore an Archived Article
expected: Switch to the "Archived" tab in the articles section. Find the archived article and click "Restore" from its action menu. The article should disappear from the archived list and reappear in the "Active" tab.
result: skipped
reason: No articles available to test restoring (blocked by issues 2 and 3)

## Summary

total: 7
passed: 1
issues: 2
pending: 0
skipped: 4

## Gaps

- truth: "Scrape Blog button fetches articles from the user's blog and populates the table"
  status: failed
  reason: "User reported: I added my sitemap url, because this is what I used in the n8n automation and it worked great. And every blog has it, while a rss feed needs to be setup if I'm not mistaken. Change the scraping to work with the sitemap for example: https://himmelstraenen.de/post-sitemap.xml"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Add Article dialog submits a URL and the article appears in the table"
  status: failed
  reason: "User reported: adding a single article doesn't work either. I think it should trigger a supabase edge function but that is blocked by CORS. We should proxy that through the server and authenticate with our secret key server side."
  severity: blocker
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
