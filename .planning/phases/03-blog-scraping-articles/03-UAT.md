---
status: complete
phase: 03-blog-scraping-articles
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-01-28T10:00:00Z
updated: 2026-01-28T10:05:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. View Articles Section on Project Detail
expected: Navigate to a blog project detail page. Below the project metadata, you should see an "Articles" section with action buttons ("Add Article" and "Scrape Blog") and a table area. If no articles exist yet, an empty state message should appear. The table has columns for Title, Date, Pin Count, and URL.
result: pass

### 2. Scrape Blog Articles
expected: Click the "Scrape Blog" button. The button should show a loading spinner with "Scraping..." text and be disabled during the operation. After completion, the button should briefly turn green showing a result summary (e.g., "5 new, 2 updated") before reverting to normal. Scraped articles should appear in the table.
result: issue
reported: "I receive an error message after i click scrape Blog: Failed to scrape blog. Check your blog URL and try again. It is trying to run a supabase edge function. I would like to switch to using inngest for cloud functions."
severity: blocker

### 3. Manually Add Article by URL
expected: Click the "Add Article" button. A dialog should open with a URL input field. Enter a valid article URL (starting with http:// or https://) and submit. The dialog should close on success, and the new article should appear in the articles table.
result: issue
reported: "same issue for scraping a single article. Cors is blocking the call to the edge function."
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
expected: In the articles table, find the action menu (three-dot dropdown) on an article row. Click "Archive". The article should disappear from the active articles list. Switch to the "Archived" tab — the article should appear there.
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
  reason: "User reported: I receive an error message after i click scrape Blog: Failed to scrape blog. Check your blog URL and try again. It is trying to run a supabase edge function. I would like to switch to using inngest for cloud functions."
  severity: blocker
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Add Article dialog submits a URL and the article appears in the table"
  status: failed
  reason: "User reported: same issue for scraping a single article. Cors is blocking the call to the edge function."
  severity: blocker
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
