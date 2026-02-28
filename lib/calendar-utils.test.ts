import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatIcsDate,
  foldLine,
  buildIcsString,
  downloadIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildCalendarDescription,
  ceilTo15Minutes,
  CalendarEventInput,
  CalendarDescriptionInput,
} from './calendar-utils'

const sampleEvent: CalendarEventInput = {
  uid: 'race-abc123',
  title: 'iRacing 24h Le Mans @ Circuit de la Sarthe',
  location: 'Circuit de la Sarthe - Full',
  startTime: new Date('2026-06-13T12:00:00Z'),
  endTime: new Date('2026-06-14T12:00:00Z'),
  description: 'https://example.com/events?eventId=ev1',
}

describe('formatIcsDate', () => {
  it('formats a UTC date correctly', () => {
    const date = new Date('2026-03-15T18:00:00Z')
    expect(formatIcsDate(date)).toBe('20260315T180000Z')
  })

  it('formats midnight correctly', () => {
    const date = new Date('2026-01-01T00:00:00Z')
    expect(formatIcsDate(date)).toBe('20260101T000000Z')
  })
})

describe('foldLine', () => {
  it('leaves lines of 75 chars or fewer unchanged', () => {
    const line = 'A'.repeat(75)
    expect(foldLine(line)).toBe(line)
  })

  it('folds lines longer than 75 chars with CRLF + space', () => {
    const line = 'SUMMARY:' + 'X'.repeat(80)
    const folded = foldLine(line)
    expect(folded).toContain('\r\n ')
    const parts = folded.split('\r\n ')
    expect(parts[0].length).toBe(75)
  })

  it('handles lines much longer than 75 chars with multiple folds', () => {
    const line = 'DESCRIPTION:' + 'Y'.repeat(200)
    const folded = foldLine(line)
    const allLines = folded.split('\r\n')
    for (const l of allLines) {
      expect(l.length).toBeLessThanOrEqual(75)
    }
  })
})

describe('buildIcsString', () => {
  it('uses CRLF line endings throughout', () => {
    const ics = buildIcsString(sampleEvent)
    // Every line end should be CRLF
    expect(ics).toContain('\r\n')
    // No bare LF (without preceding CR)
    const bareNewlines = ics.replace(/\r\n/g, '').includes('\n')
    expect(bareNewlines).toBe(false)
  })

  it('contains required ICS structure', () => {
    const ics = buildIcsString(sampleEvent)
    expect(ics).toContain('BEGIN:VCALENDAR\r\n')
    expect(ics).toContain('BEGIN:VEVENT\r\n')
    expect(ics).toContain('END:VEVENT\r\n')
    expect(ics).toContain('END:VCALENDAR\r\n')
    expect(ics).toContain('VERSION:2.0\r\n')
  })

  it('includes event UID with suffix', () => {
    const ics = buildIcsString(sampleEvent)
    expect(ics).toContain('race-abc123@race-team-planner')
  })

  it('includes start and end times', () => {
    const ics = buildIcsString(sampleEvent)
    expect(ics).toContain('DTSTART:20260613T120000Z')
    expect(ics).toContain('DTEND:20260614T120000Z')
  })

  it('rounds end time up to the next 15-minute boundary in DTEND', () => {
    const event = { ...sampleEvent, endTime: new Date('2026-06-14T11:54:00Z') }
    const ics = buildIcsString(event)
    expect(ics).toContain('DTEND:20260614T120000Z') // 11:54 -> 12:00
  })

  it('includes description with app URL', () => {
    const ics = buildIcsString(sampleEvent)
    expect(ics).toContain('https://example.com/events?eventId=ev1')
  })

  it('includes discord URL in description when provided', () => {
    const eventWithDiscord = {
      ...sampleEvent,
      description:
        'https://example.com/events?eventId=ev1\nhttps://discord.com/channels/12345/67890',
    }
    const ics = buildIcsString(eventWithDiscord)
    // Unfold RFC 5545 line continuations before checking content
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('https://discord.com/channels/12345/67890')
  })

  it('has no unfolded lines longer than 75 chars', () => {
    const ics = buildIcsString(sampleEvent)
    const lines = ics.split('\r\n')
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })
})

const appUrl = 'https://example.com/events?eventId=ev1'
const discordUrl = 'https://discord.com/channels/99999/88888'

const baseDescriptionInput: CalendarDescriptionInput = {
  eventName: 'IMSA Endurance Series',
  track: 'Circuit de la Sarthe',
  trackConfig: 'Grand Prix',
  startTime: new Date('2026-06-13T12:00:00Z'),
  durationMins: 360,
  tempValue: 72,
  tempUnits: 0,
  relHumidity: 45,
  carClasses: [
    { name: 'GT3 Class', shortName: 'GT3' },
    { name: 'GTE Class', shortName: 'GTE' },
  ],
  appUrl,
  discordUrl: null,
}

describe('buildCalendarDescription', () => {
  it('includes the event name', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain('IMSA Endurance Series')
  })

  it('includes the track and config', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain('Circuit de la Sarthe')
    expect(desc).toContain('Grand Prix')
  })

  it('omits track config when not provided', () => {
    const desc = buildCalendarDescription({ ...baseDescriptionInput, trackConfig: null })
    expect(desc).toContain('Circuit de la Sarthe')
    expect(desc).not.toContain('Grand Prix')
  })

  it('includes the start time with Starts: label', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toMatch(/Starts:.*6\/13/)
  })

  it('includes the end time when provided', () => {
    const desc = buildCalendarDescription({
      ...baseDescriptionInput,
      endTime: new Date('2026-06-13T18:14:00Z'),
    })
    expect(desc).toMatch(/Ends:.*6\/13/)
  })

  it('omits end time when not provided', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).not.toContain('Ends:')
  })

  it('includes duration', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain('Race Duration: 6h')
  })

  it('includes temperature with units', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain('Temp: 72°F')
  })

  it('includes humidity', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain('Humidity: 45%')
  })

  it('includes car class short names', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain('GT3')
    expect(desc).toContain('GTE')
  })

  it('falls back to class name when shortName is absent', () => {
    const input = {
      ...baseDescriptionInput,
      carClasses: [{ name: 'Grand Touring', shortName: null }],
    }
    const desc = buildCalendarDescription(input)
    expect(desc).toContain('Grand Touring')
  })

  it('omits Classes line when no car classes provided', () => {
    const desc = buildCalendarDescription({ ...baseDescriptionInput, carClasses: [] })
    expect(desc).not.toContain('Classes:')
  })

  it('omits optional weather/duration fields when not provided', () => {
    const desc = buildCalendarDescription({
      ...baseDescriptionInput,
      durationMins: null,
      tempValue: null,
      relHumidity: null,
    })
    expect(desc).not.toContain('Race Duration:')
    expect(desc).not.toContain('Temp:')
    expect(desc).not.toContain('Humidity:')
  })

  it('includes the app event URL', () => {
    const desc = buildCalendarDescription(baseDescriptionInput)
    expect(desc).toContain(`Event page: ${appUrl}`)
  })

  it('without Discord thread: does not include Discord URL', () => {
    const desc = buildCalendarDescription({ ...baseDescriptionInput, discordUrl: null })
    expect(desc).not.toContain('discord.com')
  })

  it('with Discord thread: includes Discord URL', () => {
    const desc = buildCalendarDescription({ ...baseDescriptionInput, discordUrl })
    expect(desc).toContain(`Discord: ${discordUrl}`)
  })
})

const eventWithoutDiscord: CalendarEventInput = {
  ...sampleEvent,
  description: appUrl,
}

const eventWithDiscordThread: CalendarEventInput = {
  ...sampleEvent,
  description: `${appUrl}\n${discordUrl}`,
}

describe('buildGoogleCalendarUrl', () => {
  it('returns a Google Calendar render URL', () => {
    const url = buildGoogleCalendarUrl(eventWithoutDiscord)
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render/)
  })

  it('includes action=TEMPLATE', () => {
    const url = new URL(buildGoogleCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
  })

  it('includes the event title', () => {
    const url = new URL(buildGoogleCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('text')).toBe(sampleEvent.title)
  })

  it('includes dates in ICS format as start/end pair', () => {
    const url = new URL(buildGoogleCalendarUrl(eventWithoutDiscord))
    const dates = url.searchParams.get('dates') ?? ''
    const [start, end] = dates.split('/')
    expect(start).toBe('20260613T120000Z')
    expect(end).toBe('20260614T120000Z')
  })

  it('rounds end time up to the next 15-minute boundary', () => {
    const event = { ...sampleEvent, endTime: new Date('2026-06-14T11:54:00Z') }
    const url = new URL(buildGoogleCalendarUrl(event))
    const [, end] = (url.searchParams.get('dates') ?? '').split('/')
    expect(end).toBe('20260614T120000Z') // 11:54 -> 12:00
  })

  it('includes the location', () => {
    const url = new URL(buildGoogleCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('location')).toBe(sampleEvent.location)
  })

  it('without Discord thread: description contains only the app URL', () => {
    const url = new URL(buildGoogleCalendarUrl(eventWithoutDiscord))
    const details = url.searchParams.get('details') ?? ''
    expect(details).toContain(appUrl)
    expect(details).not.toContain('discord.com')
  })

  it('with Discord thread: description contains both app URL and Discord URL', () => {
    const url = new URL(buildGoogleCalendarUrl(eventWithDiscordThread))
    const details = url.searchParams.get('details') ?? ''
    expect(details).toContain(appUrl)
    expect(details).toContain(discordUrl)
  })
})

describe('buildOutlookCalendarUrl', () => {
  it('returns an Outlook deeplink compose URL', () => {
    const url = buildOutlookCalendarUrl(eventWithoutDiscord)
    expect(url).toMatch(/^https:\/\/outlook\.live\.com\/calendar\//)
  })

  it('includes rru=addevent', () => {
    const url = new URL(buildOutlookCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('rru')).toBe('addevent')
  })

  it('includes the event title as subject', () => {
    const url = new URL(buildOutlookCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('subject')).toBe(sampleEvent.title)
  })

  it('includes startdt and enddt as ISO strings', () => {
    const url = new URL(buildOutlookCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('startdt')).toBe(sampleEvent.startTime.toISOString())
    expect(url.searchParams.get('enddt')).toBe(sampleEvent.endTime.toISOString())
  })

  it('rounds end time up to the next 15-minute boundary', () => {
    const event = { ...sampleEvent, endTime: new Date('2026-06-14T11:54:00Z') }
    const url = new URL(buildOutlookCalendarUrl(event))
    expect(url.searchParams.get('enddt')).toBe('2026-06-14T12:00:00.000Z') // 11:54 -> 12:00
  })

  it('includes the location', () => {
    const url = new URL(buildOutlookCalendarUrl(eventWithoutDiscord))
    expect(url.searchParams.get('location')).toBe(sampleEvent.location)
  })

  it('without Discord thread: body contains only the app URL', () => {
    const url = new URL(buildOutlookCalendarUrl(eventWithoutDiscord))
    const body = url.searchParams.get('body') ?? ''
    expect(body).toContain(appUrl)
    expect(body).not.toContain('discord.com')
  })

  it('with Discord thread: body contains both app URL and Discord URL', () => {
    const url = new URL(buildOutlookCalendarUrl(eventWithDiscordThread))
    const body = url.searchParams.get('body') ?? ''
    expect(body).toContain(appUrl)
    expect(body).toContain(discordUrl)
  })
})

describe('downloadIcs', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>
  let clickMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:fake-url')
    revokeObjectURLMock = vi.fn()
    clickMock = vi.fn()

    global.URL.createObjectURL = createObjectURLMock
    global.URL.revokeObjectURL = revokeObjectURLMock

    const fakeAnchor = {
      href: '',
      download: '',
      click: clickMock,
    } as unknown as HTMLAnchorElement

    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor)
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => fakeAnchor)
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => fakeAnchor)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL from a Blob', () => {
    downloadIcs(sampleEvent, 'race.ics')
    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('triggers a click on the anchor element', () => {
    downloadIcs(sampleEvent, 'race.ics')
    expect(clickMock).toHaveBeenCalled()
  })

  it('revokes the object URL after download', () => {
    downloadIcs(sampleEvent, 'race.ics')
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:fake-url')
  })

  it('appends and removes the anchor from the DOM', () => {
    downloadIcs(sampleEvent, 'race.ics')
    expect(appendChildSpy).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalled()
  })
})

describe('ceilTo15Minutes', () => {
  it('rounds up a time that is not on a 15-minute boundary', () => {
    // 1:54am -> 2:00am
    expect(ceilTo15Minutes(new Date('2026-06-13T01:54:00Z'))).toEqual(
      new Date('2026-06-13T02:00:00Z')
    )
  })

  it('rounds up by a few minutes', () => {
    // 1:46am -> 2:00am
    expect(ceilTo15Minutes(new Date('2026-06-13T01:46:00Z'))).toEqual(
      new Date('2026-06-13T02:00:00Z')
    )
  })

  it('rounds up 1 minute past a boundary', () => {
    // 1:31am -> 1:45am
    expect(ceilTo15Minutes(new Date('2026-06-13T01:31:00Z'))).toEqual(
      new Date('2026-06-13T01:45:00Z')
    )
  })

  it('does not advance a time already on a 15-minute boundary', () => {
    // 2:00am stays 2:00am (already on boundary — no advance)
    expect(ceilTo15Minutes(new Date('2026-06-13T02:00:00Z'))).toEqual(
      new Date('2026-06-13T02:00:00Z')
    )
  })

  it('does not advance :15, :30, :45 boundaries', () => {
    expect(ceilTo15Minutes(new Date('2026-06-13T01:15:00Z'))).toEqual(
      new Date('2026-06-13T01:15:00Z')
    )
    expect(ceilTo15Minutes(new Date('2026-06-13T01:30:00Z'))).toEqual(
      new Date('2026-06-13T01:30:00Z')
    )
    expect(ceilTo15Minutes(new Date('2026-06-13T01:45:00Z'))).toEqual(
      new Date('2026-06-13T01:45:00Z')
    )
  })

  it('handles midnight boundary correctly', () => {
    // 23:54 -> 00:00 next day
    expect(ceilTo15Minutes(new Date('2026-06-13T23:54:00Z'))).toEqual(
      new Date('2026-06-14T00:00:00Z')
    )
  })
})
