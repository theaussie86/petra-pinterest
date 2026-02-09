---
status: complete
phase: 05-ai-metadata-publishing
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md
started: 2026-02-09T12:00:00Z
updated: 2026-02-09T12:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Generate Metadata Button Appears on Pin Detail
expected: Open a pin detail page for a pin with no title/description. A single "Generate Metadata" button is visible. No Regenerate or History buttons shown.
result: pass

### 2. Generate Metadata Produces Title, Description, and Alt Text
expected: Click "Generate Metadata" on a pin. Button shows loading state. After a few seconds, the pin updates with AI-generated title, description, and alt text. Pin status changes to "metadaten_erstellt".
result: pass

### 3. Regenerate Controls Appear After First Generation
expected: After metadata has been generated, the pin detail page shows three controls: "Regenerate with Feedback", "View History", and "Regenerate". The single "Generate" button is gone.
result: pass

### 4. Regenerate with Feedback Refines Metadata
expected: Click "Regenerate with Feedback". A dialog opens with a textarea. Type feedback (e.g., "make the title shorter"). Submit. New metadata is generated incorporating your feedback. The previous generation is preserved in history.
result: pass

### 5. Metadata History Shows Generations with Restore
expected: Click "View History". A dialog shows up to 3 previous generations with timestamps and preview text. The current generation is marked with a "Current" badge. Each non-current generation has a "Restore" button. Clicking Restore applies that generation's metadata to the pin.
result: pass

### 6. Alt Text Visible on Pin Detail Page
expected: After metadata generation, the pin detail page displays the alt_text field value.
result: pass

### 7. Error Recovery Resets to Previous Status
expected: If a pin is in "fehler" (error) status, an error alert is shown with a "Reset Status" button. Clicking it resets the pin to its previous status (before the error), not always to "entwurf".
result: pass

### 8. Schedule a Single Pin with Date and Time
expected: On pin detail page, a scheduling section appears. Pick a date from the calendar (past dates are disabled). Select a preset time (e.g., 9:00) or enter a custom time. The pin's scheduled_at updates. Pin status auto-advances to "bereit_zum_planen".
result: pass

### 9. Scheduling Requires Metadata First
expected: For a pin without title/description, the scheduling section is disabled or shows a message that metadata is required before scheduling.
result: pass

### 10. Clear Schedule Does Not Change Status
expected: On a scheduled pin, clear the schedule. The scheduled_at is removed, but the pin's status does NOT automatically change (stays at its current status).
result: pass

### 11. Bulk Generate Metadata from Pins List
expected: On the pins list page, select multiple pins using checkboxes. A "Generate Metadata (N)" button appears in the toolbar. Click it. Pins are queued for async generation (status changes to "metadaten_werden_generiert"). Selection is cleared after triggering.
result: pass

### 12. Bulk Schedule Pins from Pins List
expected: Select multiple pins in the list. Click "Schedule (N)". A dialog opens with date picker, time presets, and interval configuration. Set a start date/time and interval. A preview shows how pins will be spread. Confirm. Pins get scheduled dates. Selection stays open until dialog is confirmed.
result: pass

### 13. Scheduled Date Visible in Table and Grid Views
expected: Pins list in table view shows a "Scheduled" column with the date/time. Grid view shows the scheduled date on the card.
result: pass

### 14. Phase 5 Status Workflow in Status Dropdown
expected: On pin detail page, the status dropdown shows all Phase 5 statuses. User-selectable statuses include: entwurf, bereit_fuer_generierung, metadaten_generieren, metadaten_erstellt, bereit_zum_planen. System-managed statuses appear greyed out.
result: pass

### 15. Alt Text Editable in Edit Dialog
expected: Open the pin edit dialog. An "Alt Text" field is present and editable. Save changes and the alt_text persists.
result: pass

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
