/**
 * Per-project persistence helpers for the calendar view state.
 *
 * Stored in localStorage so the user returns to the same month/week/view
 * when they re-enter the calendar via the side nav (URL search params
 * would be lost on a fresh nav click).
 *
 * All helpers are SSR-safe (guarded on `typeof window`) and swallow
 * errors from private mode, quota limits, or corrupted values so they
 * never throw from a render path.
 */

import { format } from 'date-fns'

export type CalendarView = 'month' | 'week'

const dateKey = (projectId: string) => `pinma-calendar-month-${projectId}`
const viewKey = (projectId: string) => `pinma-calendar-view-${projectId}`

export function loadCalendarDate(projectId: string): Date | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(dateKey(projectId))
    if (!stored) return null
    const parsed = new Date(stored)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  } catch {
    return null
  }
}

export function saveCalendarDate(projectId: string, date: Date): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(dateKey(projectId), format(date, 'yyyy-MM-dd'))
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

export function loadCalendarView(projectId: string): CalendarView | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(viewKey(projectId))
    if (stored === 'month' || stored === 'week') return stored
    return null
  } catch {
    return null
  }
}

export function saveCalendarView(projectId: string, view: CalendarView): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(viewKey(projectId), view)
  } catch {
    // ignore
  }
}
