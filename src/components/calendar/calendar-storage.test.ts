import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  loadCalendarDate,
  saveCalendarDate,
  loadCalendarView,
  saveCalendarView,
} from './calendar-storage'

describe('calendar-storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('date persistence', () => {
    it('returns null when nothing is stored for the project', () => {
      expect(loadCalendarDate('project-a')).toBeNull()
    })

    it('round-trips a date via save/load', () => {
      const date = new Date('2026-05-14T10:00:00Z')
      saveCalendarDate('project-a', date)

      const loaded = loadCalendarDate('project-a')
      expect(loaded).not.toBeNull()
      // Persisted as yyyy-MM-dd, so same day (ignoring time of day)
      expect(loaded!.getFullYear()).toBe(2026)
      expect(loaded!.getMonth()).toBe(4) // May
      expect(loaded!.getDate()).toBe(14)
    })

    it('persists the raw date (not normalized to month start) so week view is restored', () => {
      // Mid-month date: a week view that points at May 14 should come back as May 14
      const date = new Date(2026, 4, 14) // 2026-05-14
      saveCalendarDate('project-a', date)

      const raw = window.localStorage.getItem('pinma-calendar-month-project-a')
      expect(raw).toBe('2026-05-14')
    })

    it('scopes storage per project', () => {
      saveCalendarDate('project-a', new Date(2026, 4, 14))
      saveCalendarDate('project-b', new Date(2026, 8, 3))

      expect(loadCalendarDate('project-a')!.getMonth()).toBe(4)
      expect(loadCalendarDate('project-b')!.getMonth()).toBe(8)
    })

    it('returns null for a corrupted stored value', () => {
      window.localStorage.setItem('pinma-calendar-month-project-a', 'not-a-date')
      expect(loadCalendarDate('project-a')).toBeNull()
    })

    it('does not throw when localStorage.setItem throws (quota / private mode)', () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError')
        })

      expect(() =>
        saveCalendarDate('project-a', new Date(2026, 4, 14))
      ).not.toThrow()

      setItemSpy.mockRestore()
    })

    it('does not throw when localStorage.getItem throws', () => {
      const getItemSpy = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('SecurityError')
        })

      expect(() => loadCalendarDate('project-a')).not.toThrow()
      expect(loadCalendarDate('project-a')).toBeNull()

      getItemSpy.mockRestore()
    })
  })

  describe('view persistence', () => {
    it('returns null when nothing is stored', () => {
      expect(loadCalendarView('project-a')).toBeNull()
    })

    it('round-trips month view', () => {
      saveCalendarView('project-a', 'month')
      expect(loadCalendarView('project-a')).toBe('month')
    })

    it('round-trips week view', () => {
      saveCalendarView('project-a', 'week')
      expect(loadCalendarView('project-a')).toBe('week')
    })

    it('scopes view per project', () => {
      saveCalendarView('project-a', 'week')
      saveCalendarView('project-b', 'month')

      expect(loadCalendarView('project-a')).toBe('week')
      expect(loadCalendarView('project-b')).toBe('month')
    })

    it('returns null for an invalid stored value', () => {
      window.localStorage.setItem('pinma-calendar-view-project-a', 'quarter')
      expect(loadCalendarView('project-a')).toBeNull()
    })

    it('does not throw when localStorage.setItem throws', () => {
      const setItemSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError')
        })

      expect(() => saveCalendarView('project-a', 'week')).not.toThrow()

      setItemSpy.mockRestore()
    })
  })
})
