---
status: complete
phase: 09-consistent-ui-dashboard-layout
source: 09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md, 09-04-SUMMARY.md, 09-05-SUMMARY.md
started: 2026-02-10T22:00:00Z
updated: 2026-02-10T22:15:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Sidebar Navigation Visible
expected: On any authenticated page, a left sidebar shows "Petra" branding, Dashboard + Calendar nav items with active state highlighting, and user info (avatar, name, email) in the footer.
result: issue
reported: "The brand name should be PinMa which is short for Pinterest Management. I still miss a button that indicates toggling the sidebar width, although the functionality is there when clicking on the border. And the biggest problem is that the sidebar sits on top of the main content and hides the left side of the main content. It should be part of the main layout and the main content in the middle should adjust its size according to the width of the menu sidebar. And the menu items are not centered properly and the padding seem to be a bit off."
severity: major

### 2. Sidebar Collapse/Expand
expected: Clicking the sidebar trigger button (hamburger/arrow icon in the page header area) collapses the sidebar. The main content area expands to fill the available space. Clicking again expands the sidebar back.
result: issue
reported: "pass for mobile. there is no button visible. it collapses clicking the border, which is okay. The main content doesn't adjust to the available space. The sidebar seems to be on top of the main content and not next to it in the layout flow."
severity: major

### 3. Sidebar User Menu
expected: Clicking the user section in the sidebar footer opens a dropdown menu showing the user's email and a "Sign out" option.
result: pass

### 4. Dashboard Uses PageLayout
expected: The Dashboard page shows a "Dashboard" title in the page header area. Content is contained within a wide max-width container (not full-bleed). No old-style top navigation bar is visible.
result: pass

### 5. Calendar Uses PageLayout
expected: The Calendar page shows a "Calendar" title in the page header. Calendar filters, status chips, and grid render correctly within the layout. Opening the right pin sidebar does NOT conflict with the left app sidebar.
result: issue
reported: "pass. but the main content is still behind the app side bar and the left part is hidden."
severity: major

### 6. Project Detail Breadcrumbs
expected: Navigating to a project detail page shows breadcrumbs: "Dashboard > [Project Name]". Clicking "Dashboard" in the breadcrumbs navigates back to the dashboard.
result: pass

### 7. Article Detail Breadcrumbs and Layout
expected: Navigating to an article detail page shows breadcrumbs: "Dashboard > [Article Title]". Content uses a narrow container width suitable for reading.
result: issue
reported: "pass. but I wanted the breadcrumbs and url to match this pattern: /projects/[PROJ_ID/NAME]/articles/[ARTICLE_ID/NAME]"
severity: minor

### 8. Pin Detail Breadcrumbs and Layout
expected: Navigating to a pin detail page shows breadcrumbs: "Dashboard > [Pin Title]". Pin actions (edit, delete, status, scheduling, metadata, publish) are visible in the page header area.
result: issue
reported: "same as with articles. url and breadcrumbs should be /projects/[project]/pins/[pin]"
severity: minor

### 9. Compact Page Header
expected: The page header on all pages uses compact spacing — it should not take up excessive vertical space. Title text is modestly sized (not overly large).
result: pass

### 10. No Content Overlap with Sidebar
expected: When the sidebar is expanded, the main content area shifts to the right and does not hide behind the sidebar. All content remains visible and accessible.
result: issue
reported: "No, the content is still hidden behind the sidebar."
severity: major

## Summary

total: 10
passed: 4
issues: 6
pending: 0
skipped: 0

## Gaps

- truth: "Sidebar is part of the main layout with proper branding, toggle button, centered menu items, and content area adjusts to sidebar width"
  status: failed
  reason: "User reported: The brand name should be PinMa which is short for Pinterest Management. I still miss a button that indicates toggling the sidebar width, although the functionality is there when clicking on the border. And the biggest problem is that the sidebar sits on top of the main content and hides the left side of the main content. It should be part of the main layout and the main content in the middle should adjust its size according to the width of the menu sidebar. And the menu items are not centered properly and the padding seem to be a bit off."
  severity: major
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Sidebar collapse/expand causes main content area to adjust its width to fill available space"
  status: failed
  reason: "User reported: pass for mobile. there is no button visible. it collapses clicking the border, which is okay. The main content doesn't adjust to the available space. The sidebar seems to be on top of the main content and not next to it in the layout flow."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Calendar main content is fully visible and not hidden behind the app sidebar"
  status: failed
  reason: "User reported: pass. but the main content is still behind the app side bar and the left part is hidden."
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Article breadcrumbs and URL follow nested pattern /projects/[project]/articles/[article]"
  status: failed
  reason: "User reported: pass. but I wanted the breadcrumbs and url to match this pattern: /projects/[PROJ_ID/NAME]/articles/[ARTICLE_ID/NAME]"
  severity: minor
  test: 7
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Pin breadcrumbs and URL follow nested pattern /projects/[project]/pins/[pin]"
  status: failed
  reason: "User reported: same as with articles. url and breadcrumbs should be /projects/[project]/pins/[pin]"
  severity: minor
  test: 8
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Main content area shifts right when sidebar is expanded, all content visible and accessible"
  status: failed
  reason: "User reported: No, the content is still hidden behind the sidebar."
  severity: major
  test: 10
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
