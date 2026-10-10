// Shared formatting helpers for publish-event views (pin-detail history and the
// global log), so both render timestamps identically.

/** Format an ISO timestamp as a localized date + time (e.g. "10. Okt. 2026, 10:00"). */
export function formatDateTime(dateString: string, language: string): string {
  return new Date(dateString).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
