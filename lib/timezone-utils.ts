export const TIMEZONE_COOKIE_NAME = 'rtp_tz'
export const DEFAULT_TIMEZONE = 'UTC'

export interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface TimeZoneOption {
  value: string
  label: string
}

const COMMON_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: 'UTC', label: 'GMT / UTC' },
  { value: 'America/Los_Angeles', label: 'US Pacific (America/Los_Angeles)' },
  { value: 'America/Denver', label: 'US Mountain (America/Denver)' },
  { value: 'America/Chicago', label: 'US Central (America/Chicago)' },
  { value: 'America/New_York', label: 'US Eastern (America/New_York)' },
  { value: 'America/Sao_Paulo', label: 'Brazil (America/Sao_Paulo)' },
  { value: 'Europe/London', label: 'UK (Europe/London)' },
  { value: 'Europe/Berlin', label: 'Central Europe (Europe/Berlin)' },
  { value: 'Asia/Tokyo', label: 'Japan (Asia/Tokyo)' },
  { value: 'Australia/Sydney', label: 'Australia East (Australia/Sydney)' },
]

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()
const MAX_FORMATTER_CACHE_SIZE = 200

function getCachedFormatter(
  cacheKey: string,
  factory: () => Intl.DateTimeFormat
): Intl.DateTimeFormat {
  const existing = FORMATTER_CACHE.get(cacheKey)
  if (existing) return existing

  const formatter = factory()
  if (FORMATTER_CACHE.size >= MAX_FORMATTER_CACHE_SIZE) {
    const oldestKey = FORMATTER_CACHE.keys().next().value
    if (oldestKey !== undefined) {
      FORMATTER_CACHE.delete(oldestKey)
    }
  }
  FORMATTER_CACHE.set(cacheKey, formatter)
  return formatter
}

/**
 * Returns true when `tz` is a valid IANA time zone identifier accepted by `Intl.DateTimeFormat`.
 */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false
  try {
    getCachedFormatter(`validate:${tz}`, () => new Intl.DateTimeFormat('en-US', { timeZone: tz }))
    return true
  } catch {
    return false
  }
}

/**
 * Safely decodes and validates a raw `rtp_tz` cookie value, returning `undefined`
 * on missing, malformed URI-encoded, or invalid IANA timezone strings.
 */
export function parseTimeZoneCookie(rawValue: string | null | undefined): string | undefined {
  if (!rawValue) return undefined
  let decoded: string
  try {
    decoded = decodeURIComponent(rawValue)
  } catch {
    return undefined
  }
  return isValidTimeZone(decoded) ? decoded : undefined
}

/**
 * Resolves a candidate time zone, falling back to `fallback` (default `'UTC'`) when invalid.
 */
export function resolveTimeZone(
  tz: string | null | undefined,
  fallback: string = DEFAULT_TIMEZONE
): string {
  if (isValidTimeZone(tz)) return tz
  return isValidTimeZone(fallback) ? fallback : DEFAULT_TIMEZONE
}

/**
 * Extracts numeric calendar wall-clock parts for a UTC `Date` in `timeZone`.
 * Uses `hourCycle: 'h23'` so midnight is always `0` (never `24`).
 */
export function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = getCachedFormatter(
    `parts:${timeZone}`,
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
  )

  const parts = formatter.formatToParts(date)
  const map: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number.parseInt(part.value, 10)
    }
  }

  const rawHour = map.hour ?? 0
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
  }
}

/**
 * Computes `(wallClockAsUTC - utcInstant)` in milliseconds for `instant` in `timeZone`.
 * For example, PST (`UTC-8`) returns `-28_800_000`.
 */
export function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = getDatePartsInTimeZone(instant, timeZone)
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  const truncatedInstantMs = instant.getTime() - instant.getUTCMilliseconds()
  return wallAsUtc - truncatedInstantMs
}

/**
 * Converts wall-clock components in `timeZone` to an exact UTC `Date` using
 * two-pass offset resolution so DST boundaries are handled accurately.
 * Nonexistent spring-forward gap times advance forward across the gap.
 */
export function wallTimeToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number = 0,
  millisecond: number = 0,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  if (!isValidTimeZone(timeZone)) {
    return new Date(Number.NaN)
  }

  // Validate calendar date (e.g. reject Feb 30) and time bounds
  const calendarCheck = new Date(Date.UTC(year, month - 1, day))
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    return new Date(Number.NaN)
  }

  const targetWallUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  if (timeZone === 'UTC') {
    return new Date(targetWallUtc)
  }

  // Pass 1: estimate UTC instant using offset at targetWallUtc
  const offset1 = getTimeZoneOffsetMs(new Date(targetWallUtc), timeZone)
  const guess1 = new Date(targetWallUtc - offset1)

  // Pass 2: refine with the actual offset at guess1 (fixes 1h error across DST transitions)
  const offset2 = getTimeZoneOffsetMs(guess1, timeZone)
  const guess2 = new Date(targetWallUtc - offset2)

  // If the requested wall time falls inside a nonexistent spring-forward gap,
  // guess2 lands before the transition while guess1 advances forward across it.
  if (offset2 !== offset1 && getTimeZoneOffsetMs(guess2, timeZone) !== offset2) {
    return guess1
  }

  return guess2
}

const DATETIME_LOCAL_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

/**
 * Parses a bare `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DDTHH:mm:ss`) string from
 * `<input type="datetime-local">` as a wall-clock time in `timeZone`, returning a UTC `Date`.
 * Returns an Invalid Date (`isNaN(d.getTime())`) if malformed or if `timeZone` is invalid.
 */
export function parseDateTimeInTimeZone(
  dateTimeLocal: string,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  if (typeof dateTimeLocal !== 'string') {
    return new Date(Number.NaN)
  }

  const trimmed = dateTimeLocal.trim()
  const match = DATETIME_LOCAL_REGEX.exec(trimmed)
  if (!match) {
    return new Date(Number.NaN)
  }

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  const hour = Number.parseInt(match[4], 10)
  const minute = Number.parseInt(match[5], 10)
  const second = match[6] ? Number.parseInt(match[6], 10) : 0
  const millisecond = match[7] ? Number.parseInt(match[7].padEnd(3, '0'), 10) : 0

  return wallTimeToUtcDate(year, month, day, hour, minute, second, millisecond, timeZone)
}

/**
 * Formats a `Date` or ISO string into `YYYY-MM-DDTHH:mm` in `timeZone`
 * suitable for `<input type="datetime-local">`.
 */
export function formatDateTimeForInput(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''

  const tz = resolveTimeZone(timeZone)
  const parts = getDatePartsInTimeZone(d, tz)
  const yyyy = String(parts.year).padStart(4, '0')
  const mm = String(parts.month).padStart(2, '0')
  const dd = String(parts.day).padStart(2, '0')
  const hh = String(parts.hour).padStart(2, '0')
  const min = String(parts.minute).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

/**
 * Converts a `YYYY-MM-DDTHH:mm` wall-clock string from `fromTimeZone` to `toTimeZone`
 * without changing the underlying UTC instant. Returns `''` for empty inputs.
 */
export function convertDateTimeLocalTimeZone(
  dateTimeLocal: string,
  fromTimeZone: string,
  toTimeZone: string
): string {
  if (!dateTimeLocal || !dateTimeLocal.trim()) return ''
  if (fromTimeZone === toTimeZone) return dateTimeLocal
  const parsed = parseDateTimeInTimeZone(dateTimeLocal, fromTimeZone)
  if (Number.isNaN(parsed.getTime())) return dateTimeLocal
  return formatDateTimeForInput(parsed, toTimeZone)
}

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Computes inclusive UTC start-of-day (`00:00:00.000`) and end-of-day (`23:59:59.999`)
 * bounds for a `YYYY-MM-DD` date string in `timeZone`.
 */
export function getDayBoundsInTimeZone(
  dateStr: string,
  timeZone: string = DEFAULT_TIMEZONE
): { startOfDay: Date; endOfDay: Date } | null {
  const match = DATE_ONLY_REGEX.exec(dateStr.trim())
  if (!match) return null

  const tz = resolveTimeZone(timeZone)
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)

  const startOfDay = wallTimeToUtcDate(year, month, day, 0, 0, 0, 0, tz)
  const endOfDay = wallTimeToUtcDate(year, month, day, 23, 59, 59, 999, tz)
  if (Number.isNaN(startOfDay.getTime()) || Number.isNaN(endOfDay.getTime())) {
    return null
  }

  return { startOfDay, endOfDay }
}

/**
 * Computes Monday `00:00:00.000` in `timeZone` for the week containing `now`.
 */
export function getWeekStartInTimeZone(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  const tz = resolveTimeZone(timeZone)
  const parts = getDatePartsInTimeZone(now, tz)
  const calendarDayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const dayOfWeek = calendarDayUtc.getUTCDay() // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  calendarDayUtc.setUTCDate(calendarDayUtc.getUTCDate() + diffToMonday)

  return wallTimeToUtcDate(
    calendarDayUtc.getUTCFullYear(),
    calendarDayUtc.getUTCMonth() + 1,
    calendarDayUtc.getUTCDate(),
    0,
    0,
    0,
    0,
    tz
  )
}

/**
 * Returns a short timezone abbreviation (e.g. `'UTC'`, `'PDT'`, `'EST'`, `'BST'`)
 * for `date` in `timeZone`.
 */
export function formatShortTimeZoneName(
  date: Date | string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const tz = resolveTimeZone(timeZone)
  if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT') {
    return 'UTC'
  }

  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return tz

  try {
    const formatter = getCachedFormatter(
      `tz-short:${tz}`,
      () =>
        new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'short',
        })
    )
    const parts = formatter.formatToParts(d)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

/**
 * Formats a race timestamp consistently as `M/D • h:mm AM TZ` (or `M/D • h:mm AM` when
 * `includeTimeZoneName` is `false`) in `timeZone`.
 */
export function formatRaceDateTime(
  date: Date | string,
  timeZone: string = DEFAULT_TIMEZONE,
  options: { includeTimeZoneName?: boolean } = {}
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''

  const tz = resolveTimeZone(timeZone)
  const includeTimeZoneName = options.includeTimeZoneName ?? true

  const dateFmt = getCachedFormatter(
    `race-date:${tz}`,
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        month: 'numeric',
        day: 'numeric',
      })
  )
  const timeFmt = getCachedFormatter(
    `race-time:${tz}`,
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
      })
  )

  const formatted = `${dateFmt.format(d)} • ${timeFmt.format(d)}`
  if (!includeTimeZoneName) {
    return formatted
  }
  return `${formatted} ${formatShortTimeZoneName(d, tz)}`
}

/**
 * Returns grouped time zone options with `GMT / UTC` first, the browser local timezone
 * highlighted in `common`, curated popular sim-racing regions, and all remaining IANA zones.
 * Every option `value` across `common` and `all` is guaranteed unique.
 */
export function getTimeZoneOptions(localTimeZone?: string | null): {
  common: TimeZoneOption[]
  all: TimeZoneOption[]
} {
  const validLocal = isValidTimeZone(localTimeZone) ? localTimeZone : undefined

  const common: TimeZoneOption[] = COMMON_TIMEZONES.map((item) => ({
    value: item.value,
    label: validLocal === item.value ? `${item.label} • Local` : item.label,
  }))

  if (validLocal && !common.some((item) => item.value === validLocal)) {
    common.splice(1, 0, {
      value: validLocal,
      label: `Local (${validLocal})`,
    })
  }

  const commonSet = new Set(common.map((item) => item.value))

  let supported: string[] = []
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      supported = Intl.supportedValuesOf('timeZone')
    }
  } catch {
    supported = []
  }

  const all: TimeZoneOption[] = supported
    .filter((tz) => !commonSet.has(tz))
    .sort((a, b) => a.localeCompare(b))
    .map((tz) => ({ value: tz, label: tz }))

  return { common, all }
}
