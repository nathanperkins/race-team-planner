import { appTimeZone } from './config'
import { getDatePartsInTimeZone, wallTimeToUtcDate } from './timezone-utils'

/**
 * Create a date with a specific time, relative to today.
 *
 * @param daysOffset - Number of days from today (positive for future, negative for past)
 * @param hours - Hour in app timezone 24-hour format (0-23)
 * @param minutes - Minutes (0-59)
 * @returns Date object for that day at that time in the app's timezone
 */
export function dateWithTime(daysOffset: number, hours: number, minutes: number = 0): Date {
  const now = new Date()
  const { year, month, day } = getDatePartsInTimeZone(now, appTimeZone)
  const targetDate = new Date(Date.UTC(year, month - 1, day + daysOffset, 0, 0, 0))
  return setLocalTime(targetDate, hours, minutes)
}

/**
 * Set a specific time in the app's timezone on a date.
 *
 * @param date - The base date to use (year/month/day read in UTC)
 * @param hours - Hour in target timezone 24-hour format (0-23)
 * @param minutes - Minutes (0-59)
 * @param timeZone - Optional timezone override (defaults to appTimeZone from config)
 * @returns Date object representing that local time (stored as UTC internally)
 */
export function setLocalTime(
  date: Date,
  hours: number,
  minutes: number = 0,
  timeZone: string = appTimeZone
): Date {
  if (hours < 0 || hours > 23) {
    throw new RangeError(`Invalid hours value: ${hours}. Must be between 0 and 23.`)
  }
  if (minutes < 0 || minutes > 59) {
    throw new RangeError(`Invalid minutes value: ${minutes}. Must be between 0 and 59.`)
  }

  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()

  return wallTimeToUtcDate(year, month, day, hours, minutes, 0, 0, timeZone)
}
