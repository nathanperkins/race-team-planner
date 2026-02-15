import { appTimeZone } from './config'

/**
 * Create a date with a specific time, relative to today.
 *
 * @param daysOffset - Number of days from today (positive for future, negative for past)
 * @param hours - Hour in app timezone 24-hour format (0-23)
 * @param minutes - Minutes (0-59)
 * @returns Date object for that day at that time in the app's timezone
 *
 * @example
 * // Tomorrow at 10:30 AM
 * const date = dateWithTime(1, 10, 30)
 *
 * // 7 days ago at 2:00 PM
 * const pastDate = dateWithTime(-7, 14, 0)
 */
export function dateWithTime(daysOffset: number, hours: number, minutes: number = 0): Date {
  // Get today's date
  const today = new Date()

  // Add the day offset
  const targetDate = new Date(today.getTime() + daysOffset * 24 * 60 * 60 * 1000)

  // Set the time in the app's timezone
  return setLocalTime(targetDate, hours, minutes)
}

/**
 * Set a specific time in the app's timezone on a date.
 *
 * @param date - The base date to use
 * @param hours - Hour in app timezone 24-hour format (0-23)
 * @param minutes - Minutes (0-59)
 * @param timeZone - Optional timezone override (defaults to appTimeZone from config)
 * @returns Date object representing that local time (stored as UTC internally)
 *
 * ⚠️ Note: This function assumes en-US locale formatting for date parsing.
 * It may not work correctly in non-US locales.
 */
export function setLocalTime(
  date: Date,
  hours: number,
  minutes: number = 0,
  timeZone: string = appTimeZone
): Date {
  // Validate input ranges
  if (hours < 0 || hours > 23) {
    throw new RangeError(`Invalid hours value: ${hours}. Must be between 0 and 23.`)
  }
  if (minutes < 0 || minutes > 59) {
    throw new RangeError(`Invalid minutes value: ${minutes}. Must be between 0 and 59.`)
  }

  // Use UTC methods to avoid system timezone issues
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  // Create a test UTC date to calculate the timezone offset
  const testDate = new Date(Date.UTC(year, month, day, hours, minutes))

  // See what this UTC time looks like in the target timezone
  const formatted = testDate.toLocaleString('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Parse the formatted string
  const [datePart, timePart] = formatted.split(', ')
  const [m, d, y] = datePart.split('/')
  const [h, min] = timePart.split(':')

  // Calculate the offset
  const localAsUTC = Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min))
  const offset = testDate.getTime() - localAsUTC

  // Apply offset to our desired local time
  const desiredLocal = Date.UTC(year, month, day, hours, minutes)
  return new Date(desiredLocal + offset)
}
