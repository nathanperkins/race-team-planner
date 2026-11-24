import { describe, expect, it } from 'vitest'
import {
  convertDateTimeLocalTimeZone,
  formatDateTimeForInput,
  formatRaceDateTime,
  formatShortTimeZoneName,
  getDayBoundsInTimeZone,
  getTimeZoneOptions,
  getWeekStartInTimeZone,
  isValidTimeZone,
  parseDateTimeInTimeZone,
  parseTimeZoneCookie,
  resolveTimeZone,
} from './timezone-utils'

describe('timezone-utils', () => {
  describe('isValidTimeZone & resolveTimeZone', () => {
    it('validates IANA time zones and UTC', () => {
      expect(isValidTimeZone('UTC')).toBe(true)
      expect(isValidTimeZone('America/Los_Angeles')).toBe(true)
      expect(isValidTimeZone('Europe/London')).toBe(true)
      expect(isValidTimeZone('Australia/Sydney')).toBe(true)
      expect(isValidTimeZone('')).toBe(false)
      expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
      expect(isValidTimeZone(null)).toBe(false)
      expect(isValidTimeZone(undefined)).toBe(false)
    })

    it('falls back safely when invalid', () => {
      expect(resolveTimeZone('America/New_York')).toBe('America/New_York')
      expect(resolveTimeZone('Invalid/Zone', 'UTC')).toBe('UTC')
      expect(resolveTimeZone(undefined)).toBe('UTC')
    })

    it('safely parses rtp_tz cookie values including malformed URI sequences', () => {
      expect(parseTimeZoneCookie('America%2FLos_Angeles')).toBe('America/Los_Angeles')
      expect(parseTimeZoneCookie('UTC')).toBe('UTC')
      expect(parseTimeZoneCookie('%E0%A4%A')).toBeUndefined()
      expect(parseTimeZoneCookie('Not%2FAZone')).toBeUndefined()
      expect(parseTimeZoneCookie(undefined)).toBeUndefined()
    })
  })

  describe('parseDateTimeInTimeZone & formatDateTimeForInput', () => {
    it('parses and formats GMT / UTC deterministically regardless of system TZ', () => {
      const date = parseDateTimeInTimeZone('2026-03-21T12:00', 'UTC')
      expect(date.toISOString()).toBe('2026-03-21T12:00:00.000Z')
      expect(formatDateTimeForInput(date, 'UTC')).toBe('2026-03-21T12:00')
    })

    it('parses winter PST (UTC-8) and summer PDT (UTC-7) accurately', () => {
      const winter = parseDateTimeInTimeZone('2026-01-15T10:30', 'America/Los_Angeles')
      expect(winter.toISOString()).toBe('2026-01-15T18:30:00.000Z')

      const summer = parseDateTimeInTimeZone('2026-07-15T10:30', 'America/Los_Angeles')
      expect(summer.toISOString()).toBe('2026-07-15T17:30:00.000Z')
    })

    it('handles DST spring-forward and fall-back boundary days without 1-hour drift', () => {
      // US DST spring forward: 2026-03-08 at 02:00 PST -> 03:00 PDT
      const beforeSpring = parseDateTimeInTimeZone('2026-03-08T01:30', 'America/Los_Angeles')
      expect(beforeSpring.toISOString()).toBe('2026-03-08T09:30:00.000Z')
      expect(formatDateTimeForInput(beforeSpring, 'America/Los_Angeles')).toBe('2026-03-08T01:30')

      const afterSpring = parseDateTimeInTimeZone('2026-03-08T03:30', 'America/Los_Angeles')
      expect(afterSpring.toISOString()).toBe('2026-03-08T10:30:00.000Z')
      expect(formatDateTimeForInput(afterSpring, 'America/Los_Angeles')).toBe('2026-03-08T03:30')

      // Nonexistent spring-forward gap (02:30 does not exist) advances forward to 03:30 PDT
      const springGap = parseDateTimeInTimeZone('2026-03-08T02:30', 'America/Los_Angeles')
      expect(springGap.toISOString()).toBe('2026-03-08T10:30:00.000Z')
      expect(formatDateTimeForInput(springGap, 'America/Los_Angeles')).toBe('2026-03-08T03:30')

      // US DST fall back: 2026-11-01 at 02:00 PDT -> 01:00 PST
      const afterFall = parseDateTimeInTimeZone('2026-11-01T03:30', 'America/Los_Angeles')
      expect(afterFall.toISOString()).toBe('2026-11-01T11:30:00.000Z')
      expect(formatDateTimeForInput(afterFall, 'America/Los_Angeles')).toBe('2026-11-01T03:30')
    })

    it('formats midnight as 00:00 (never 24:00)', () => {
      const midnightUtc = new Date('2026-05-10T00:00:00.000Z')
      expect(formatDateTimeForInput(midnightUtc, 'UTC')).toBe('2026-05-10T00:00')

      const midnightPdt = new Date('2026-05-10T07:00:00.000Z')
      expect(formatDateTimeForInput(midnightPdt, 'America/Los_Angeles')).toBe('2026-05-10T00:00')
    })

    it('maintains 0ms drift across repeated round-trips in multiple zones', () => {
      const zones = [
        'UTC',
        'America/Los_Angeles',
        'America/New_York',
        'Europe/London',
        'Australia/Sydney',
      ]
      const canonical = new Date('2026-06-13T13:00:00.000Z') // e.g. Le Mans 24h start

      for (const tz of zones) {
        let current = canonical
        for (let i = 0; i < 5; i++) {
          const inputVal = formatDateTimeForInput(current, tz)
          current = parseDateTimeInTimeZone(inputVal, tz)
        }
        expect(current.toISOString()).toBe('2026-06-13T13:00:00.000Z')
      }
    })

    it('returns Invalid Date for malformed strings, impossible calendar dates, or invalid zones', () => {
      expect(Number.isNaN(parseDateTimeInTimeZone('not-a-date', 'UTC').getTime())).toBe(true)
      expect(Number.isNaN(parseDateTimeInTimeZone('2026-02-30T10:00', 'UTC').getTime())).toBe(true)
      expect(Number.isNaN(parseDateTimeInTimeZone('2026-06-01T25:00', 'UTC').getTime())).toBe(true)
      expect(
        Number.isNaN(parseDateTimeInTimeZone('2026-06-01T10:00', 'Invalid/Zone').getTime())
      ).toBe(true)
      expect(formatDateTimeForInput(null, 'UTC')).toBe('')
      expect(formatDateTimeForInput('invalid', 'UTC')).toBe('')
    })
  })

  describe('convertDateTimeLocalTimeZone', () => {
    it('converts wall-clock input across zones while preserving the UTC instant', () => {
      // 12:00 UTC on March 21, 2026 -> 05:00 PDT in America/Los_Angeles
      const inLa = convertDateTimeLocalTimeZone('2026-03-21T12:00', 'UTC', 'America/Los_Angeles')
      expect(inLa).toBe('2026-03-21T05:00')

      // Back to UTC -> 12:00
      const backToUtc = convertDateTimeLocalTimeZone(inLa, 'America/Los_Angeles', 'UTC')
      expect(backToUtc).toBe('2026-03-21T12:00')
    })

    it('preserves empty string when timeslot input is blank', () => {
      expect(convertDateTimeLocalTimeZone('', 'UTC', 'America/Los_Angeles')).toBe('')
    })
  })

  describe('getDayBoundsInTimeZone & getWeekStartInTimeZone', () => {
    it('computes inclusive start and end of day in target time zone', () => {
      const bounds = getDayBoundsInTimeZone('2026-03-21', 'America/Los_Angeles')
      expect(bounds).not.toBeNull()
      // PDT is UTC-7
      expect(bounds!.startOfDay.toISOString()).toBe('2026-03-21T07:00:00.000Z')
      expect(bounds!.endOfDay.toISOString()).toBe('2026-03-22T06:59:59.999Z')
    })

    it('computes Monday 00:00 in target time zone for week start', () => {
      // Wednesday 2026-03-18 15:00Z -> Monday 2026-03-16 00:00 PDT (07:00Z)
      const weekStart = getWeekStartInTimeZone(
        new Date('2026-03-18T15:00:00.000Z'),
        'America/Los_Angeles'
      )
      expect(weekStart.toISOString()).toBe('2026-03-16T07:00:00.000Z')
    })
  })

  describe('formatShortTimeZoneName & getTimeZoneOptions', () => {
    it('formats UTC cleanly as UTC and regional zones with short names', () => {
      expect(formatShortTimeZoneName('2026-03-21T12:00:00Z', 'UTC')).toBe('UTC')
      expect(formatShortTimeZoneName('2026-07-15T12:00:00Z', 'America/Los_Angeles')).toBe('PDT')
      expect(formatShortTimeZoneName('2026-01-15T12:00:00Z', 'America/Los_Angeles')).toBe('PST')
    })

    it('formats race date and time consistently with optional timezone name', () => {
      expect(formatRaceDateTime('2026-03-06T19:00:00Z', 'America/Los_Angeles')).toBe(
        '3/6 • 11:00 AM PST'
      )
      expect(
        formatRaceDateTime('2026-03-06T19:00:00Z', 'America/Los_Angeles', {
          includeTimeZoneName: false,
        })
      ).toBe('3/6 • 11:00 AM')
      expect(formatRaceDateTime('2026-03-06T19:00:00Z', 'UTC')).toBe('3/6 • 7:00 PM UTC')
    })

    it('returns deduplicated options with GMT / UTC first and local zone included', () => {
      const { common, all } = getTimeZoneOptions('America/Phoenix')
      expect(common[0].value).toBe('UTC')
      expect(common[0].label).toContain('GMT / UTC')
      expect(common.some((o) => o.value === 'America/Phoenix')).toBe(true)

      const seen = new Set<string>()
      for (const opt of [...common, ...all]) {
        expect(seen.has(opt.value)).toBe(false)
        seen.add(opt.value)
      }
    })
  })
})
