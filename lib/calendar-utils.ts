export interface CalendarEventInput {
  uid: string
  title: string
  location: string
  startTime: Date
  endTime: Date
  description: string
}

export interface CalendarDescriptionInput {
  eventName: string
  track: string
  trackConfig?: string | null
  startTime: Date
  durationMins?: number | null
  tempValue?: number | null
  tempUnits?: number | null
  relHumidity?: number | null
  carClasses?: Array<{ name: string; shortName?: string | null }>
  appUrl: string
  discordUrl?: string | null
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function buildCalendarDescription(input: CalendarDescriptionInput): string {
  const lines: string[] = []

  const trackLine = input.trackConfig ? `${input.track} - ${input.trackConfig}` : input.track
  lines.push(input.eventName)
  lines.push(trackLine)

  lines.push(
    input.startTime.toLocaleString('en-US', {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  )

  const meta: string[] = []
  if (input.durationMins) meta.push(`Duration: ${formatDuration(input.durationMins)}`)
  if (input.tempValue != null) meta.push(`Temp: ${input.tempValue}°${input.tempUnits || 'F'}`)
  if (input.relHumidity != null) meta.push(`Humidity: ${input.relHumidity}%`)
  if (meta.length > 0) lines.push(meta.join(' | '))

  if (input.carClasses && input.carClasses.length > 0) {
    const names = input.carClasses.map((c) => c.shortName || c.name).join(', ')
    lines.push(`Classes: ${names}`)
  }

  lines.push('')
  lines.push(`Event page: ${input.appUrl}`)
  if (input.discordUrl) lines.push(`Discord: ${input.discordUrl}`)

  return lines.join('\n')
}

export function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  parts.push(line.slice(0, 75))
  let i = 75
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74))
    i += 74
  }
  return parts.join('\r\n')
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function buildIcsString(event: CalendarEventInput): string {
  const now = formatIcsDate(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Race Team Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldLine(`UID:${event.uid}@race-team-planner`),
    foldLine(`DTSTAMP:${now}`),
    foldLine(`DTSTART:${formatIcsDate(event.startTime)}`),
    foldLine(`DTEND:${formatIcsDate(event.endTime)}`),
    foldLine(`SUMMARY:${escapeText(event.title)}`),
    foldLine(`LOCATION:${escapeText(event.location)}`),
    foldLine(`DESCRIPTION:${escapeText(event.description)}`),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
  return lines.join('\r\n')
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const dates = `${formatIcsDate(event.startTime)}/${formatIcsDate(event.endTime)}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details: event.description,
    location: event.location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildOutlookCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    subject: event.title,
    startdt: event.startTime.toISOString(),
    enddt: event.endTime.toISOString(),
    body: event.description,
    location: event.location,
    path: '/calendar/action/compose',
    rru: 'addevent',
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

export function downloadIcs(event: CalendarEventInput, filename: string): void {
  const icsString = buildIcsString(event)
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
