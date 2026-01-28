---
status: complete
phase: 03-blog-scraping-articles
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-06-SUMMARY.md, 03-07-PLAN.md, 03-08-PLAN.md]
started: 2026-01-28T14:00:00Z
updated: 2026-01-28T14:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. View Articles Section on Project Detail
expected: Navigate to a blog project detail page. You should see an "Articles" section with "Add Article" and "Scrape Blog" buttons above a table area. If no articles exist, an empty state message appears.
result: pass

### 2. Scrape Blog Articles (Sitemap-Based)
expected: Click the "Scrape Blog" button. The button should show a loading spinner with "Scraping..." text and be disabled. After completion, it should briefly turn green showing a result summary (e.g., "5 new, 2 updated") before reverting. Scraped articles should populate the table. No CORS errors in browser console.
result: issue
reported: "it works but since the job is now running async in the background no summary is shown"
severity: minor

### 3. Manually Add Article by URL
expected: Click "Add Article". A dialog opens with a URL input. Enter a valid blog article URL (starting with http:// or https://), submit. Dialog closes on success, article appears in the table. No CORS errors.
result: pass

### 4. Sort Articles Table
expected: Click column headers (Title, Date, URL) in the articles table. Clicking a header sorts by that column. Clicking again toggles ascending/descending. An arrow icon indicates current sort direction.
result: pass

### 5. View Article Detail Page
expected: Click on an article title in the table. You navigate to an article detail page showing: title, publication date, source URL, and full scraped content with professional typography. A "Back" link returns to the project detail page.
result: pass

### 6. Archive an Article
expected: In the articles table, find the action menu (three-dot dropdown) on an article row. Click "Archive". The article disappears from the active list. Switch to the "Archived" tab — the article appears there.
result: pass

### 7. Restore an Archived Article
expected: Switch to the "Archived" tab. Click "Restore" from an archived article's action menu. The article disappears from archived and reappears in the "Active" tab.
result: pass

### 8. Project Settings Show Sitemap URL
expected: Edit a blog project (click edit). The form should show a "Sitemap URL" field (not "RSS URL"). The project detail page should display "Sitemap:" label with the URL or "Not configured".
result: pass

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Scrape Blog button shows result summary (e.g. 5 new, 2 updated) after completion"
  status: failed
  reason: "User reported: it works but since the job is now running async in the background no summary is shown"
  severity: minor
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
