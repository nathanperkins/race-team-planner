import { describe, expect, it, vi } from 'vitest'
import { dateWithTime, setLocalTime } from './date-utils'

describe('setLocalTime', () => {
  it('should set time in Pacific timezone (default)', () => {
    const date = new Date('2026-01-15') // Winter (PST)
    const result = setLocalTime(date, 10, 30)

    // 10:30 AM PST = 6:30 PM UTC (10:30 + 8 hours)
    expect(result.getUTCHours()).toBe(18)
    expect(result.getUTCMinutes()).toBe(30)
  })

  it('should handle DST correctly', () => {
    const date = new Date('2026-07-15') // Summer (PDT)
    const result = setLocalTime(date, 14, 0)

    // 2:00 PM PDT = 9:00 PM UTC (14:00 + 7 hours)
    expect(result.getUTCHours()).toBe(21)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it('should preserve the local date when setting time', () => {
    const date = new Date('2026-03-20')
    const result = setLocalTime(date, 14, 30)

    // Verify it's still March 20 when viewed in PT
    const formatted = result.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    expect(formatted).toContain('03/20/2026')
    expect(formatted).toContain('14:30')
  })

  it('should handle midnight correctly', () => {
    const date = new Date('2026-02-14')
    const result = setLocalTime(date, 0, 0)

    // Midnight PST = 8:00 AM UTC
    expect(result.getUTCHours()).toBe(8)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it('should default minutes to 0 when not provided', () => {
    const date = new Date('2026-01-15')
    const result = setLocalTime(date, 10)

    // 10:00 AM PST = 6:00 PM UTC
    expect(result.getUTCHours()).toBe(18)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it('should work with custom timezone', () => {
    const date = new Date('2026-01-15')
    const result = setLocalTime(date, 12, 0, 'America/New_York')

    // Noon EST (UTC-5) = 5:00 PM UTC
    expect(result.getUTCHours()).toBe(17)
    expect(result.getUTCMinutes()).toBe(0)
  })

  it('should work with UTC timezone', () => {
    const date = new Date('2026-01-15')
    const result = setLocalTime(date, 15, 30, 'UTC')

    // 3:30 PM UTC = 3:30 PM UTC
    expect(result.getUTCHours()).toBe(15)
    expect(result.getUTCMinutes()).toBe(30)
  })

  it('should reject invalid hours', () => {
    const date = new Date('2026-01-15')
    expect(() => setLocalTime(date, 24)).toThrow(RangeError)
    expect(() => setLocalTime(date, -1)).toThrow(RangeError)
    expect(() => setLocalTime(date, 25)).toThrow(RangeError)
  })

  it('should reject invalid minutes', () => {
    const date = new Date('2026-01-15')
    expect(() => setLocalTime(date, 10, 60)).toThrow(RangeError)
    expect(() => setLocalTime(date, 10, -1)).toThrow(RangeError)
    expect(() => setLocalTime(date, 10, 99)).toThrow(RangeError)
  })
})

describe('dateWithTime', () => {
  it('should create a date N days from now with specified time', () => {
    const now = new Date('2026-02-14T12:00:00Z')
    vi.setSystemTime(now)

    const result = dateWithTime(7, 10, 30)

    // Should be 7 days from Feb 14 = Feb 21 at 10:30 AM PT
    const formatted = result.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    expect(formatted).toContain('02/21/2026')
    expect(formatted).toContain('10:30')
  })

  it('should handle negative offsets for past dates', () => {
    const now = new Date('2026-02-14T12:00:00Z')
    vi.setSystemTime(now)

    const result = dateWithTime(-30, 14, 0)

    // Should be 30 days before Feb 14 = Jan 15 at 2:00 PM PT
    const formatted = result.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    expect(formatted).toContain('01/15/2026')
    expect(formatted).toContain('14:00')
  })

  it('should handle today (offset 0)', () => {
    const now = new Date('2026-02-14T12:00:00Z')
    vi.setSystemTime(now)

    const result = dateWithTime(0, 10, 0)

    const formatted = result.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    expect(formatted).toContain('02/14/2026')
  })

  it('should default minutes to 0', () => {
    const now = new Date('2026-02-14T12:00:00Z')
    vi.setSystemTime(now)

    const result = dateWithTime(1, 10)

    // Check the time is 10:00
    const formatted = result.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    expect(formatted).toBe('10:00')
  })
})
