import { describe, it, expect } from 'vitest'
import {
  buildDiscordAppLink,
  buildDiscordWebLink,
  buildDiscordLink,
  resolveDiscordHref,
  isMobileUserAgent,
  normalizeSeriesName,
  chunkLines,
  formatTeamLines,
  formatMultiTimeslotTeamLines,
  buildWeeklyScheduleEmbeds,
  buildRegistrationEmbed,
  buildOnboardingEmbed,
  buildEventThreadName,
  buildTeamsAssignedEmbeds,
  buildTeamsAssignedChatNotification,
  collectDiscordIds,
  formatISODate,
  formatRaceTimesValue,
  detectRosterChanges,
  buildRosterChangesEmbed,
  buildJoinEventButton,
  buildMainEventThreadButton,
  parseDiscordErrorBody,
} from './discord-utils'

describe('Discord Utils', () => {
  describe('buildDiscordAppLink', () => {
    it('returns a discord:// deep link', () => {
      expect(buildDiscordAppLink({ guildId: 'g1', threadId: 't1' })).toBe(
        'discord://-/channels/g1/t1'
      )
    })
  })

  describe('buildDiscordWebLink', () => {
    it('returns an https://discord.com link', () => {
      expect(buildDiscordWebLink({ guildId: 'g1', threadId: 't1' })).toBe(
        'https://discord.com/channels/g1/t1'
      )
    })
  })

  describe('isMobileUserAgent', () => {
    it('returns true for Android', () => {
      expect(
        isMobileUserAgent(
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        )
      ).toBe(true)
    })

    it('returns true for iPhone', () => {
      expect(
        isMobileUserAgent(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        )
      ).toBe(true)
    })

    it('returns true for iPad', () => {
      expect(
        isMobileUserAgent(
          'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        )
      ).toBe(true)
    })

    it('returns false for macOS Chrome', () => {
      expect(
        isMobileUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
      ).toBe(false)
    })

    it('returns false for Windows Chrome', () => {
      expect(
        isMobileUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
      ).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isMobileUserAgent('')).toBe(false)
    })
  })

  describe('buildDiscordLink', () => {
    const opts = { guildId: 'guild-1', threadId: 'thread-1' }
    const androidUA =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    const desktopUA =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    it('returns discord:// deep link for desktop user agent', () => {
      expect(buildDiscordLink({ ...opts, userAgent: desktopUA })).toBe(
        'discord://-/channels/guild-1/thread-1'
      )
    })

    it('returns https://discord.com link for mobile user agent', () => {
      expect(buildDiscordLink({ ...opts, userAgent: androidUA })).toBe(
        'https://discord.com/channels/guild-1/thread-1'
      )
    })
  })

  describe('resolveDiscordHref', () => {
    const discordHref = 'discord://-/channels/guild-1/channel-1'
    const androidUA =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    const desktopUA =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    it('keeps discord:// href on desktop', () => {
      expect(resolveDiscordHref(discordHref, desktopUA)).toBe(discordHref)
    })

    it('rewrites discord:// to https://discord.com on mobile', () => {
      expect(resolveDiscordHref(discordHref, androidUA)).toBe(
        'https://discord.com/channels/guild-1/channel-1'
      )
    })

    it('leaves non-discord URLs unchanged on mobile', () => {
      expect(resolveDiscordHref('https://example.com/feedback', androidUA)).toBe(
        'https://example.com/feedback'
      )
    })
  })

  describe('normalizeSeriesName', () => {
    it('removes season and week suffix', () => {
      expect(normalizeSeriesName('GT3 Fanatic Series - 2024 Season 1')).toBe('GT3 Fanatic Series')
      expect(normalizeSeriesName('IMSA - Season 2 Week 5')).toBe('IMSA')
      expect(normalizeSeriesName('NASCAR – 2023 S3')).toBe('NASCAR')
      expect(normalizeSeriesName('Global Mazda MX-5 Cup - Week 12')).toBe('Global Mazda MX-5 Cup')
    })

    it('trims whitespace', () => {
      expect(normalizeSeriesName('  My Series  ')).toBe('My Series')
    })
  })

  describe('chunkLines', () => {
    it('splits lines into chunks within maxLength', () => {
      const lines = ['Line 1', 'Line 2', 'Line 3']
      const chunks = chunkLines(lines, 15) // small maxLength
      expect(chunks).toHaveLength(2)
      expect(chunks[0]).toBe('Line 1\nLine 2')
      expect(chunks[1]).toBe('Line 3')
    })

    it('handles lines longer than maxLength by splitting them', () => {
      const lines = ['VeryLongLineThatExceedsMaxLength']
      const chunks = chunkLines(lines, 10)
      expect(chunks).toHaveLength(4)
      expect(chunks[0]).toBe('VeryLongLi')
    })
  })

  describe('formatTeamLines', () => {
    it('formats teams and assigned members correctly', () => {
      const teams = [
        {
          name: 'Team Red',
          members: [
            { name: 'Alice', carClass: 'GT3', discordId: '123' },
            { name: 'Bob', carClass: 'GT3' },
          ],
        },
      ]
      const lines = formatTeamLines(teams, [])
      expect(lines).toContain('**Team Red**')
      expect(lines).toContain('• <@123>')
      expect(lines).toContain('• Bob')
    })

    it('formats unassigned members with class group header', () => {
      const unassigned = [{ name: 'Charlie', carClass: 'GT3' }]
      const lines = formatTeamLines([], unassigned)
      expect(lines).toContain('**Unassigned - GT3**')
      expect(lines).toContain('• Charlie')
      expect(lines).not.toContain('**Unassigned**')
    })

    it('groups unassigned members by car class sorted by class then name', () => {
      const unassigned = [
        { name: 'Victor', carClass: 'LMP2' },
        { name: 'Adam', carClass: 'GTP' },
        { name: 'Steven', carClass: 'GT3' },
        { name: 'Nathan', carClass: 'LMP2' },
        { name: 'John', carClass: 'GTP' },
        { name: 'Kaelan', carClass: 'GT3' },
      ]
      const lines = formatTeamLines([], unassigned)

      // All three group headers present
      expect(lines).toContain('**Unassigned - GT3**')
      expect(lines).toContain('**Unassigned - GTP**')
      expect(lines).toContain('**Unassigned - LMP2**')
      // No generic Unassigned header
      expect(lines).not.toContain('**Unassigned**')

      // Classes appear in alphabetical order
      const gt3Idx = lines.indexOf('**Unassigned - GT3**')
      const gtpIdx = lines.indexOf('**Unassigned - GTP**')
      const lmp2Idx = lines.indexOf('**Unassigned - LMP2**')
      expect(gt3Idx).toBeLessThan(gtpIdx)
      expect(gtpIdx).toBeLessThan(lmp2Idx)

      // Within GT3: Kaelan before Steven
      const kaelanIdx = lines.indexOf('• Kaelan')
      const stevenIdx = lines.indexOf('• Steven')
      expect(kaelanIdx).toBeGreaterThan(gt3Idx)
      expect(kaelanIdx).toBeLessThan(stevenIdx)

      // Within GTP: Adam before John
      const adamIdx = lines.indexOf('• Adam')
      const johnIdx = lines.indexOf('• John')
      expect(adamIdx).toBeGreaterThan(gtpIdx)
      expect(adamIdx).toBeLessThan(johnIdx)

      // Within LMP2: Nathan before Victor
      const nathanIdx = lines.indexOf('• Nathan')
      const victorIdx = lines.indexOf('• Victor')
      expect(nathanIdx).toBeGreaterThan(lmp2Idx)
      expect(nathanIdx).toBeLessThan(victorIdx)
    })

    it('uses discord mention instead of name for unassigned members with discordId', () => {
      const unassigned = [
        { name: 'Alice', carClass: 'GT3', discordId: '111' },
        { name: 'Bob', carClass: 'GT3' },
      ]
      const lines = formatTeamLines([], unassigned)
      expect(lines).toContain('• <@111>')
      expect(lines).toContain('• Bob')
      expect(lines).not.toContain('• Alice')
    })

    it('sorts unassigned by display label (discord mention sorts by ID string, name sorts alphabetically)', () => {
      const unassigned = [
        { name: 'Zara', carClass: 'GT3', discordId: '999' },
        { name: 'Aaron', carClass: 'GT3' },
        { name: 'Mike', carClass: 'GT3' },
      ]
      const lines = formatTeamLines([], unassigned)
      // Aaron (no discord) sorts before Mike (no discord), Zara with discord mention comes after by label
      const aaronIdx = lines.indexOf('• Aaron')
      const mikeIdx = lines.indexOf('• Mike')
      expect(aaronIdx).toBeGreaterThan(0)
      expect(mikeIdx).toBeGreaterThan(aaronIdx)
    })
  })

  describe('formatMultiTimeslotTeamLines', () => {
    it('delegates to formatTeamLines for a single timeslot', () => {
      const timeslots = [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [
            {
              name: 'Team Red',
              members: [{ name: 'Alice', carClass: 'GT3' }],
            },
          ],
        },
      ]
      const lines = formatMultiTimeslotTeamLines(timeslots)
      expect(lines).toContain('**Team Red**')
      // Single timeslot should NOT have a timeslot header
      expect(lines.every((l) => !l.includes('──'))).toBe(true)
    })

    it('adds timeslot headers for multiple timeslots', () => {
      const timeslots = [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [
            {
              name: 'Team Red',
              members: [{ name: 'Alice', carClass: 'GT3' }],
            },
          ],
        },
        {
          raceStartTime: new Date('2026-02-11T22:00:00Z'),
          teams: [
            {
              name: 'Team Blue',
              members: [{ name: 'Bob', carClass: 'GT3' }],
            },
          ],
        },
      ]
      const lines = formatMultiTimeslotTeamLines(timeslots, {
        locale: 'en-US',
        timeZone: 'UTC',
      })
      // Should have timeslot dividers with clock emoji
      const timeHeaders = lines.filter((l) => l.includes('⏰'))
      expect(timeHeaders).toHaveLength(2)
      // Should have divider lines
      const dividers = lines.filter((l) => l.includes('━'))
      expect(dividers.length).toBeGreaterThan(0)
      expect(lines).toContain('**Team Red**')
      expect(lines).toContain('**Team Blue**')
    })

    it('includes unassigned members in each timeslot', () => {
      const timeslots = [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [],
          unassigned: [{ name: 'Charlie', carClass: 'GT3' }],
        },
        {
          raceStartTime: new Date('2026-02-11T22:00:00Z'),
          teams: [],
          unassigned: [{ name: 'Dave', carClass: 'GT3' }],
        },
      ]
      const lines = formatMultiTimeslotTeamLines(timeslots, {
        locale: 'en-US',
        timeZone: 'UTC',
      })
      expect(lines).toContain('• Charlie')
      expect(lines).toContain('• Dave')
      expect(lines.filter((l) => l === '**Unassigned - GT3**')).toHaveLength(2)
    })
  })

  describe('buildWeeklyScheduleEmbeds', () => {
    it('creates embeds with correct structure', () => {
      const events = [
        {
          name: 'Sunday Cup',
          track: 'Spa',
          startTime: new Date('2024-01-01T20:00:00Z'),
          endTime: new Date('2024-01-01T22:00:00Z'),
          raceTimes: [new Date('2024-01-01T20:00:00Z')],
          carClasses: ['GT3'],
          registeredUsers: [{ name: 'Dave', discordId: '456' }],
          eventUrl: 'http://example.com',
        },
      ]
      const embeds = buildWeeklyScheduleEmbeds(events)
      expect(embeds).toHaveLength(1)
      expect(embeds[0].title).toBe('📅 Sunday Cup')
      expect(embeds[0].description).toContain('**Track:** Spa')
      expect(embeds[0].description).toContain('<@456>')
    })
  })

  describe('buildRegistrationEmbed', () => {
    const data = {
      userName: 'Alice',
      eventName: 'GT3 Challenge',
      raceStartTime: new Date('2024-05-01T20:00:00Z'),
      carClassName: 'GT3',
      eventUrl: 'http://example.com',
      discordUser: { id: '123', name: 'alice' },
      threadId: 'thread-123',
      guildId: 'guild-456',
    }
    const appTitle = 'Test App'

    it('creates an embed for a registered Discord user', () => {
      const embed = buildRegistrationEmbed(data, appTitle)
      expect(embed.title).toBe('🏁 New Race Registration')
      expect(embed.description).toBe('<@123> has registered for **GT3 Challenge**')
      expect(embed.fields).toContainEqual({ name: '🏎️ Car Class', value: 'GT3', inline: true })
      expect(embed.fields).toContainEqual({
        name: '🕐 Race Time',
        value: '<t:1714593600:F>',
        inline: true,
      })
      expect(embed.fields).toContainEqual({
        name: '💬 Discussion',
        value: '[View Event Thread](https://discord.com/channels/guild-456/thread-123)',
        inline: true,
      })
      expect(embed.footer.text).toBe(appTitle)
    })

    it('creates an embed for a manual user without Discord ID', () => {
      const manualData = { ...data, discordUser: undefined }
      const embed = buildRegistrationEmbed(manualData, appTitle)
      expect(embed.description).toBe('**Alice** has registered for **GT3 Challenge**')
    })

    it('includes a thumbnail if userAvatarUrl is provided', () => {
      const avatarData = { ...data, userAvatarUrl: 'http://avatar.com' }
      const embed = buildRegistrationEmbed(avatarData, appTitle)
      expect(embed.thumbnail?.url).toBe('http://avatar.com')
    })

    it('does not include registered drivers when not requested', () => {
      const embedWithout = buildRegistrationEmbed(
        {
          ...data,
          otherRegisteredDrivers: [
            { name: 'Driver One', carClassName: 'GT3', discordId: '111' },
            { name: 'Driver Two', carClassName: 'LMP2' },
          ],
        },
        appTitle
      )
      // Without includeRegisteredDrivers, should use legacy format with basic fields
      expect(
        embedWithout.fields.some((field) => String(field.name).includes('Registrations by Class'))
      ).toBe(false)
      expect(embedWithout.title).toBe('🏁 New Race Registration')
      expect(embedWithout.fields.some((field) => field.name === '🏎️ Car Class')).toBe(true)
      expect(embedWithout.fields.some((field) => field.name === '🕐 Race Time')).toBe(true)
    })

    it('uses simplified format with only same-class racers when includeRegisteredDrivers is true', () => {
      const dataWithTrack = {
        ...data,
        track: 'Sebring Motorsports Park',
        trackConfig: 'Grand Prix',
        otherRegisteredDrivers: [
          { name: 'Driver One', carClassName: 'GT3', discordId: '111' },
          { name: 'Driver Two', carClassName: 'GT3' },
          { name: 'Driver Three', carClassName: 'LMP2' }, // Different class, should be excluded
        ],
      }

      const embed = buildRegistrationEmbed(dataWithTrack, appTitle, {
        includeRegisteredDrivers: true,
      })

      // Title should be personalized
      expect(embed.title).toBe('🚦 Alice registered for a race!')

      // Description should contain all info in simplified format
      expect(embed.description).toContain('🏆 GT3 Challenge')
      expect(embed.description).toContain('🏟️ Sebring Motorsports Park - Grand Prix')
      expect(embed.description).toContain('📅')
      expect(embed.description).toContain('🏎️ GT3')
      expect(embed.description).toContain('🧑‍🚀 Racers in Class')

      // Should show only same-class racers (GT3)
      // Alice has Discord ID, so should show as mention
      expect(embed.description).toContain('<@123>')
      expect(embed.description).toContain('<@111>') // Driver One has Discord ID
      expect(embed.description).toContain('Driver Two') // No Discord ID, show plain name
      expect(embed.description).not.toContain('Driver Three') // Different class
      expect(embed.description).not.toContain('LMP2')

      // Should not have fields in the simplified format
      expect(embed.fields).toEqual([])
    })
  })

  describe('buildOnboardingEmbed', () => {
    const data = {
      userName: 'Bob',
      iracingCustomerId: '789',
      profileUrl: 'http://profile.com',
      discordUser: { id: '456', name: 'bob' },
    }
    const appTitle = 'Test App'

    it('creates an onboarding embed with Discord ID', () => {
      const embed = buildOnboardingEmbed(data, appTitle)
      expect(embed.title).toBe('👋 New User Onboarded')
      expect(embed.description).toBe('<@456> has completed the onboarding process.')
      expect(embed.fields).toContainEqual({ name: '🆔 iRacing ID', value: '789', inline: true })
    })

    it('includes iRacing name if provided', () => {
      const nameData = { ...data, iracingName: 'Bob Speedy' }
      const embed = buildOnboardingEmbed(nameData, appTitle)
      expect(embed.fields).toContainEqual({
        name: '🏎️ iRacing Name',
        value: 'Bob Speedy',
        inline: true,
      })
    })

    it('handles manual user without Discord ID', () => {
      const manualData = { ...data, discordUser: undefined }
      const embed = buildOnboardingEmbed(manualData, appTitle)
      expect(embed.description).toBe('**Bob** has completed the onboarding process.')
    })
  })

  describe('collectDiscordIds', () => {
    it('collects Discord IDs from all timeslots', () => {
      const timeslots = [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [
            {
              name: 'Team One',
              members: [
                { name: 'Alice', carClass: 'GT3', discordId: 'disc-1', registrationId: 'reg-1' },
                { name: 'Bob', carClass: 'GT3', discordId: 'disc-2', registrationId: 'reg-2' },
              ],
            },
          ],
        },
        {
          raceStartTime: new Date('2026-02-11T22:00:00Z'),
          teams: [
            {
              name: 'Team Two',
              members: [
                { name: 'Charlie', carClass: 'GT3', discordId: 'disc-3', registrationId: 'reg-3' },
              ],
            },
          ],
        },
      ]

      const ids = collectDiscordIds(timeslots)
      expect(ids.size).toBe(3)
      expect(ids.get('reg-1')).toBe('disc-1')
      expect(ids.get('reg-2')).toBe('disc-2')
      expect(ids.get('reg-3')).toBe('disc-3')
    })

    it('collects Discord IDs from unassigned members', () => {
      const timeslots = [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [],
          unassigned: [
            { name: 'Dave', carClass: 'GT3', discordId: 'disc-4', registrationId: 'reg-4' },
          ],
        },
      ]

      const ids = collectDiscordIds(timeslots)
      expect(ids.size).toBe(1)
      expect(ids.get('reg-4')).toBe('disc-4')
    })

    it('skips members without Discord ID or registration ID', () => {
      const timeslots = [
        {
          raceStartTime: new Date('2026-02-11T20:00:00Z'),
          teams: [
            {
              name: 'Team One',
              members: [
                { name: 'Alice', carClass: 'GT3', discordId: 'disc-1', registrationId: 'reg-1' },
                { name: 'Bob', carClass: 'GT3' }, // No IDs
              ],
            },
          ],
        },
      ]

      const ids = collectDiscordIds(timeslots)
      expect(ids.size).toBe(1)
      expect(ids.get('reg-1')).toBe('disc-1')
    })
  })

  describe('formatRaceTimesValue', () => {
    it('formats single timeslot as Discord timestamp', () => {
      const timeslots = [{ raceStartTime: new Date('2026-02-11T20:00:00Z'), teams: [] }]
      const result = formatRaceTimesValue(timeslots)
      expect(result).toBe('<t:1770840000:F>')
    })

    it('formats multiple timeslots with newlines', () => {
      const timeslots = [
        { raceStartTime: new Date('2026-02-11T20:00:00Z'), teams: [] },
        { raceStartTime: new Date('2026-02-11T22:00:00Z'), teams: [] },
      ]
      const result = formatRaceTimesValue(timeslots)
      expect(result).toBe('<t:1770840000:F>\n<t:1770847200:F>')
    })
  })

  describe('formatISODate', () => {
    it('formats date in ISO format (YYYY-MM-DD)', () => {
      const date = formatISODate(new Date('2026-02-11T20:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      })
      expect(date).toBe('2026-02-11')
    })

    it('handles single-digit months and days with leading zeros', () => {
      const date = formatISODate(new Date('2026-05-02T20:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      })
      expect(date).toBe('2026-05-02')
    })

    it('uses defaults for locale and timezone', () => {
      const date = formatISODate(new Date('2026-02-11T20:00:00Z'))
      expect(date).toMatch(/\d{4}-\d{2}-\d{2}/)
    })
  })

  describe('buildEventThreadName', () => {
    it('builds thread name with normalized series and ISO date format', () => {
      const name = buildEventThreadName(
        'GT3 Fanatic Series - 2024 Season 1',
        new Date('2026-02-11T20:00:00Z'),
        { locale: 'en-US', timeZone: 'America/Los_Angeles' }
      )
      expect(name).toBe('GT3 Fanatic Series (2026-02-11)')
    })

    it('uses defaults for locale and timezone', () => {
      const name = buildEventThreadName('IMSA', new Date('2026-02-11T20:00:00Z'))
      expect(name).toMatch(/IMSA \(\d{4}-\d{2}-\d{2}\)/)
    })
  })

  describe('buildTeamsAssignedEmbeds', () => {
    it('builds comprehensive embed with all fields for multi-timeslot event', () => {
      const data = {
        eventName: 'GT3 Challenge - 2026 Season 1',
        raceUrl: 'http://example.com/events/1',
        track: 'Spa-Francorchamps',
        trackConfig: 'Grand Prix',
        tempValue: 75,
        precipChance: 20,
        carClasses: ['GT3'],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [
              {
                name: 'Team Red',
                carClassName: 'GT3',
                avgSof: 2500,
                members: [
                  { name: 'Alice', carClass: 'GT3', discordId: 'disc-1', registrationId: 'reg-1' },
                ],
              },
            ],
          },
          {
            raceStartTime: new Date('2026-02-11T22:00:00Z'),
            teams: [
              {
                name: 'Team Blue',
                carClassName: 'GT3',
                avgSof: 2400,
                members: [
                  { name: 'Bob', carClass: 'GT3', discordId: 'disc-2', registrationId: 'reg-2' },
                ],
              },
            ],
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App', {
        locale: 'en-US',
        timeZone: 'UTC',
      })

      expect(embeds).toHaveLength(1)
      const embed = embeds[0]

      // Check title and basic fields
      expect(embed.title).toBe('🏁 Event Thread: GT3 Challenge')
      expect(embed.color).toBe(0x5865f2)
      expect(embed.url).toBe(data.raceUrl)
      expect(embed.footer.text).toBe('Test App')

      // Check that description contains official message
      expect(embed.description).toContain(
        'Official preparation and coordination thread for **GT3 Challenge**'
      )

      // Check that description contains event info at the top
      expect(embed.description).toContain('**🏟️ Track:** Spa-Francorchamps (Grand Prix)')
      expect(embed.description).toContain('**🕐 Race Times:**')
      expect(embed.description).toContain('<t:1770840000:F>')
      expect(embed.description).toContain('<t:1770847200:F>')
      expect(embed.description).toContain('**🌤️ Weather:** 75°F, 20% Rain')

      // Check that description contains team sections with new time dividers
      expect(embed.description).toContain('━━━━━━━━━━━━━━━━━━━━')
      expect(embed.description).toContain('⏰ **8:00 PM UTC**')
      expect(embed.description).toContain('**Team Red**')
      expect(embed.description).toContain('• GT3')
      expect(embed.description).toContain('• 2500 SOF')
      expect(embed.description).toContain('⏰ **10:00 PM UTC**')
      expect(embed.description).toContain('**Team Blue**')

      // Verify no fields are used (event info is in description now)
      expect(embed.fields).toBeUndefined()
    })

    it('builds single-timeslot embed without time headers', () => {
      const data = {
        eventName: 'GT3 Challenge',
        raceUrl: 'http://example.com/events/1',
        carClasses: ['GT3'],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [
              {
                name: 'Team One',
                members: [{ name: 'Alice', carClass: 'GT3' }],
              },
            ],
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App')
      expect(embeds).toHaveLength(1)

      // Single timeslot should now show time header for consistency
      expect(embeds[0].description).toContain('⏰')
      expect(embeds[0].description).toContain('━━━━━━━━━━━━━━━━━━━━')
      expect(embeds[0].description).toContain('**Team One**')
      expect(embeds[0].description).toContain('• Alice')
    })

    it('handles unassigned drivers', () => {
      const data = {
        eventName: 'GT3 Challenge',
        raceUrl: 'http://example.com/events/1',
        carClasses: ['GT3'],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [],
            unassigned: [{ name: 'Charlie', carClass: 'GT3' }],
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App')
      expect(embeds[0].description).toContain('**Unassigned - GT3**')
      expect(embeds[0].description).toContain('• Charlie')
    })

    it('displays all car classes in event info', () => {
      const data = {
        eventName: 'Multi-Class Event',
        raceUrl: 'http://example.com/events/1',
        carClasses: ['GT3', 'GTE', 'LMP2'],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [
              {
                name: 'Team One',
                carClassName: 'GT3',
                members: [
                  { name: 'Alice', carClass: 'GT3' },
                  { name: 'Bob', carClass: 'GTE' },
                ],
              },
            ],
            unassigned: [{ name: 'Charlie', carClass: 'LMP2' }],
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App')
      expect(embeds[0].description).toContain('**🏎 Classes:**')
      expect(embeds[0].description).toContain('• GT3')
      expect(embeds[0].description).toContain('• GTE')
      expect(embeds[0].description).toContain('• LMP2')
    })

    it('shows empty timeslots with a message', () => {
      const data = {
        eventName: 'Empty Event',
        raceUrl: 'http://example.com/events/1',
        carClasses: [],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [],
          },
          {
            raceStartTime: new Date('2026-02-11T22:00:00Z'),
            teams: [],
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App', {
        locale: 'en-US',
        timeZone: 'UTC',
      })

      expect(embeds[0].description).toContain('⏰ **8:00 PM UTC**')
      expect(embeds[0].description).toContain('⏰ **10:00 PM UTC**')
      expect(embeds[0].description).toContain('_No teams or drivers assigned yet._')
    })

    it('shows message for timeslots with no teams or unassigned drivers', () => {
      const data = {
        eventName: 'Mixed Event',
        raceUrl: 'http://example.com/events/1',
        carClasses: ['GT3'],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [
              {
                name: 'Team One',
                members: [{ name: 'Alice', carClass: 'GT3' }],
              },
            ],
          },
          {
            // Empty timeslot - no teams, no unassigned
            raceStartTime: new Date('2026-02-11T22:00:00Z'),
            teams: [],
          },
          {
            raceStartTime: new Date('2026-02-12T00:00:00Z'),
            teams: [],
            unassigned: [{ name: 'Bob', carClass: 'GT3' }],
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App', {
        locale: 'en-US',
        timeZone: 'UTC',
      })

      const desc = embeds[0].description

      // First timeslot has teams
      expect(desc).toContain('⏰ **8:00 PM UTC**')
      expect(desc).toContain('**Team One**')

      // Second timeslot is empty - should show message
      expect(desc).toContain('⏰ **10:00 PM UTC**')
      expect(desc).toContain('_No teams or drivers assigned yet._')

      // Third timeslot has unassigned drivers
      expect(desc).toContain('⏰ **12:00 AM UTC**')
      expect(desc).toContain('**Unassigned - GT3**')
      expect(desc).toContain('• Bob')
    })

    it('shows all car classes even when some have no racers', () => {
      const data = {
        eventName: 'Multi-Class Event',
        raceUrl: 'http://example.com/events/1',
        carClasses: ['GT3', 'GTE', 'LMP2', 'LMP3'],
        timeslots: [
          {
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [
              {
                name: 'Team One',
                carClassName: 'GT3',
                members: [{ name: 'Alice', carClass: 'GT3' }],
              },
            ],
            // Only GT3 has racers, but all 4 classes should be shown
          },
        ],
      }

      const embeds = buildTeamsAssignedEmbeds(data, 'Test App')
      expect(embeds[0].description).toContain('**🏎 Classes:**')
      expect(embeds[0].description).toContain('• GT3')
      expect(embeds[0].description).toContain('• GTE')
      expect(embeds[0].description).toContain('• LMP2')
      expect(embeds[0].description).toContain('• LMP3')
    })
  })

  describe('buildTeamsAssignedChatNotification', () => {
    it('builds complete chat notification with all race times', () => {
      const timeslots = [
        { raceStartTime: new Date('2026-02-11T20:00:00Z'), teams: [] },
        { raceStartTime: new Date('2026-02-11T22:00:00Z'), teams: [] },
      ]

      const result = buildTeamsAssignedChatNotification(
        'GT3 Challenge',
        timeslots,
        'https://example.com/events?eventId=123',
        'https://discord.com/channels/123/456',
        '🏁 Teams Assigned',
        'Test App'
      )

      expect(result.embeds).toBeDefined()
      const embed = (result.embeds as any[])[0]

      expect(embed.title).toBe('🏁 Teams Assigned')
      expect(embed.description).toBe('Teams have been assigned for **GT3 Challenge**!')
      expect(embed.color).toBe(0x5865f2)
      expect(embed.url).toBe('https://discord.com/channels/123/456')
      expect(embed.footer.text).toBe('Test App')

      // Check fields
      const raceTimesField = embed.fields.find((f: any) => f.name === '🕐 Race Times')
      expect(raceTimesField.value).toContain('<t:1770840000:F>')
      expect(raceTimesField.value).toContain('<t:1770847200:F>')
      expect(raceTimesField.inline).toBe(false)

      expect(embed.fields.some((f: any) => f.name === '🔗 Discussion')).toBe(false)

      expect(result.components).toEqual([
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: 'Join Event',
              url: 'https://example.com/events?eventId=123',
            },
            {
              type: 2,
              style: 5,
              label: 'View Thread',
              url: 'https://discord.com/channels/123/456',
            },
          ],
        },
      ])
    })

    it('includes the actor when adminName is provided', () => {
      const result = buildTeamsAssignedChatNotification(
        'GT3 Challenge',
        [{ raceStartTime: new Date('2026-02-11T20:00:00Z'), teams: [] }],
        'https://example.com/events?eventId=123',
        'https://discord.com/channels/123/456',
        '🏁 Teams Updated',
        'Test App',
        'Steven Case1'
      )

      const embed = (result.embeds as any[])[0]
      expect(embed.description).toContain('Updated by **Steven Case1**.')
    })
  })

  describe('detectRosterChanges', () => {
    const teamNameById = new Map([
      ['team1', 'Team Alpha'],
      ['team2', 'Team Beta'],
    ])

    it('returns empty array for first-time assignments (no previous snapshot)', () => {
      const currentSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
        reg2: { teamId: 'team1', driverName: 'Bob' },
      }
      const changes = detectRosterChanges(null, currentSnapshot, teamNameById)
      expect(changes).toEqual([])
    })

    it('detects new driver additions', () => {
      const previousSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
      }
      const currentSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
        reg2: { teamId: 'team2', driverName: 'Bob' },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'added',
        driverName: 'Bob',
        teamName: 'Team Beta',
      })
    })

    it('detects driver assignments from unassigned', () => {
      const previousSnapshot = {
        reg1: { teamId: null, driverName: 'Alice' },
      }
      const currentSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'added',
        driverName: 'Alice',
        teamName: 'Team Alpha',
      })
    })

    it('detects driver moves between teams', () => {
      const previousSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
      }
      const currentSnapshot = {
        reg1: { teamId: 'team2', driverName: 'Alice' },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'moved',
        driverName: 'Alice',
        fromTeam: 'Team Alpha',
        toTeam: 'Team Beta',
      })
    })

    it('detects driver unassignments', () => {
      const previousSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
      }
      const currentSnapshot = {
        reg1: { teamId: null, driverName: 'Alice' },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'unassigned',
        driverName: 'Alice',
        fromTeam: 'Team Alpha',
      })
    })

    it('detects driver drops (registration deletions)', () => {
      const previousSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
        reg2: { teamId: 'team1', driverName: 'Bob' },
      }
      const currentSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'dropped',
        driverName: 'Bob',
        fromTeam: 'Team Alpha',
      })
    })

    it('detects driver drops from unassigned', () => {
      const previousSnapshot = {
        reg1: { teamId: null, driverName: 'Alice' },
      }
      const currentSnapshot = {}
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'dropped',
        driverName: 'Alice',
        fromTeam: 'Unassigned',
      })
    })

    it('detects multiple changes in one update', () => {
      const previousSnapshot = {
        reg1: { teamId: 'team1', driverName: 'Alice' },
        reg2: { teamId: 'team1', driverName: 'Bob' },
        reg3: { teamId: 'team2', driverName: 'Charlie' },
      }
      const currentSnapshot = {
        reg1: { teamId: 'team2', driverName: 'Alice' }, // Moved
        reg3: { teamId: 'team2', driverName: 'Charlie' }, // No change
        reg4: { teamId: 'team1', driverName: 'Dave' }, // Added
        // reg2 dropped
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(3)
      expect(changes).toContainEqual({
        type: 'moved',
        driverName: 'Alice',
        fromTeam: 'Team Alpha',
        toTeam: 'Team Beta',
      })
      expect(changes).toContainEqual({
        type: 'added',
        driverName: 'Dave',
        teamName: 'Team Alpha',
      })
      expect(changes).toContainEqual({
        type: 'dropped',
        driverName: 'Bob',
        fromTeam: 'Team Alpha',
      })
    })

    it('handles legacy snapshot format (string teamIds)', () => {
      const legacySnapshot: Record<string, string | null> = {
        reg1: 'team1',
        reg2: null,
      }
      const currentSnapshot = {
        reg1: { teamId: 'team2', driverName: 'Alice' },
        reg2: { teamId: 'team1', driverName: 'Bob' },
      }
      const changes = detectRosterChanges(legacySnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(2)
      // Should detect move for reg1 (uses current driver name even though legacy didn't have it)
      expect(changes).toContainEqual({
        type: 'moved',
        driverName: 'Alice',
        fromTeam: 'Team Alpha',
        toTeam: 'Team Beta',
      })
      // Should detect assignment for reg2
      expect(changes).toContainEqual({
        type: 'added',
        driverName: 'Bob',
        teamName: 'Team Alpha',
      })
    })

    it('detects team car class changes', () => {
      const previousSnapshot = {
        reg1: {
          teamId: 'team1',
          driverName: 'Alice',
          carClassId: 'class-gt3',
          carClassName: 'GT3',
        },
        reg2: {
          teamId: 'team1',
          driverName: 'Bob',
          carClassId: 'class-gt3',
          carClassName: 'GT3',
        },
        reg3: {
          teamId: 'team2',
          driverName: 'Charlie',
          carClassId: 'class-lmp2',
          carClassName: 'LMP2',
        },
      }
      const currentSnapshot = {
        reg1: {
          teamId: 'team1',
          driverName: 'Alice',
          carClassId: 'class-gte',
          carClassName: 'GTE',
        },
        reg2: {
          teamId: 'team1',
          driverName: 'Bob',
          carClassId: 'class-gte',
          carClassName: 'GTE',
        },
        reg3: {
          teamId: 'team2',
          driverName: 'Charlie',
          carClassId: 'class-lmp2',
          carClassName: 'LMP2',
        },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'teamClassChanged',
        teamName: 'Team Alpha',
        fromClass: 'GT3',
        toClass: 'GTE',
        drivers: ['Alice', 'Bob'],
      })
    })

    it('does not detect class changes as team changes when drivers move teams', () => {
      const previousSnapshot = {
        reg1: {
          teamId: 'team1',
          driverName: 'Alice',
          carClassId: 'class-gt3',
          carClassName: 'GT3',
        },
      }
      const currentSnapshot = {
        reg1: {
          teamId: 'team2',
          driverName: 'Alice',
          carClassId: 'class-lmp2',
          carClassName: 'LMP2',
        },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'moved',
        driverName: 'Alice',
        fromTeam: 'Team Alpha',
        toTeam: 'Team Beta',
      })
    })

    it('does not show dropped when unassigned driver gets assigned (even with different registration ID)', () => {
      const previousSnapshot = {
        reg1: { teamId: null, driverName: 'Mock Bob' },
      }
      const currentSnapshot = {
        reg2: { teamId: 'team1', driverName: 'Mock Bob' },
      }
      const changes = detectRosterChanges(previousSnapshot, currentSnapshot, teamNameById)
      // Should only show "added", not "dropped"
      // Bug: currently shows both added and dropped because registration ID changed
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        type: 'added',
        driverName: 'Mock Bob',
        teamName: 'Team Alpha',
      })
    })
  })

  describe('buildRosterChangesEmbed', () => {
    const appTitle = 'Test App'
    const adminName = 'John Admin'

    it('builds embed with added drivers and admin name', () => {
      const embed = buildRosterChangesEmbed(
        [{ type: 'added', driverName: 'Alice', teamName: 'Team Alpha' }],
        appTitle,
        adminName
      )
      expect(embed.title).toBe('📋 Roster Changes')
      expect(embed.description).toBe('1 change made by **John Admin**')
      expect(embed.color).toBe(0xffa500) // Orange
      expect(embed.fields).toHaveLength(1)
      expect(embed.fields[0].name).toBe('✅ Added')
      expect(embed.fields[0].value).toBe('**Alice** → Team Alpha')
      expect(embed.footer.text).toBe(appTitle)
      expect(embed.timestamp).toBeDefined()
    })

    it('builds embed with dropped drivers', () => {
      const embed = buildRosterChangesEmbed(
        [{ type: 'dropped', driverName: 'Bob', fromTeam: 'Team Alpha' }],
        appTitle,
        adminName
      )
      expect(embed.fields).toHaveLength(1)
      expect(embed.fields[0].name).toBe('❌ Dropped')
      expect(embed.fields[0].value).toBe('**Bob** (from Team Alpha)')
    })

    it('builds embed with moved drivers', () => {
      const embed = buildRosterChangesEmbed(
        [{ type: 'moved', driverName: 'Charlie', fromTeam: 'Team Alpha', toTeam: 'Team Beta' }],
        appTitle,
        adminName
      )
      expect(embed.fields).toHaveLength(1)
      expect(embed.fields[0].name).toBe('🔄 Moved')
      expect(embed.fields[0].value).toBe('**Charlie**: Team Alpha → Team Beta')
    })

    it('builds embed with unassigned drivers', () => {
      const embed = buildRosterChangesEmbed(
        [{ type: 'unassigned', driverName: 'Dave', fromTeam: 'Team Alpha' }],
        appTitle,
        adminName
      )
      expect(embed.fields).toHaveLength(1)
      expect(embed.fields[0].name).toBe('⚠️ Unassigned')
      expect(embed.fields[0].value).toBe('**Dave** (from Team Alpha)')
    })

    it('groups multiple changes by type', () => {
      const embed = buildRosterChangesEmbed(
        [
          { type: 'added', driverName: 'Alice', teamName: 'Team Alpha' },
          { type: 'added', driverName: 'Eve', teamName: 'Team Beta' },
          { type: 'dropped', driverName: 'Bob', fromTeam: 'Team Alpha' },
          { type: 'moved', driverName: 'Charlie', fromTeam: 'Team Alpha', toTeam: 'Team Beta' },
          { type: 'unassigned', driverName: 'Dave', fromTeam: 'Team Gamma' },
        ],
        appTitle,
        adminName
      )
      expect(embed.description).toBe('5 changes made by **John Admin**')
      expect(embed.fields).toHaveLength(4) // Added, Moved, Unassigned, Dropped
      expect(embed.fields[0].name).toBe('✅ Added')
      expect(embed.fields[0].value).toContain('**Alice** → Team Alpha')
      expect(embed.fields[0].value).toContain('**Eve** → Team Beta')
      expect(embed.fields[1].name).toBe('🔄 Moved')
      expect(embed.fields[2].name).toBe('⚠️ Unassigned')
      expect(embed.fields[3].name).toBe('❌ Dropped')
    })

    it('uses plural form in description for multiple changes', () => {
      const embed = buildRosterChangesEmbed(
        [
          { type: 'added', driverName: 'Alice', teamName: 'Team Alpha' },
          { type: 'dropped', driverName: 'Bob', fromTeam: 'Team Alpha' },
        ],
        appTitle,
        adminName
      )
      expect(embed.description).toBe('2 changes made by **John Admin**')
    })

    it('uses singular form in description for single change', () => {
      const embed = buildRosterChangesEmbed(
        [{ type: 'added', driverName: 'Alice', teamName: 'Team Alpha' }],
        appTitle,
        adminName
      )
      expect(embed.description).toBe('1 change made by **John Admin**')
    })

    it('shows generic description when adminName is not provided', () => {
      const embed = buildRosterChangesEmbed(
        [
          { type: 'added', driverName: 'Alice', teamName: 'Team Alpha' },
          { type: 'dropped', driverName: 'Bob', fromTeam: 'Team Alpha' },
        ],
        appTitle
      )
      expect(embed.description).toBe('2 changes to the roster')
      expect(embed.title).toBe('📋 Roster Changes')
      expect(embed.fields).toHaveLength(2)
    })

    it('shows singular generic description when adminName is not provided', () => {
      const embed = buildRosterChangesEmbed(
        [{ type: 'added', driverName: 'Alice', teamName: 'Team Alpha' }],
        appTitle
      )
      expect(embed.description).toBe('1 change to the roster')
    })

    it('builds embed with team car class changes', () => {
      const embed = buildRosterChangesEmbed(
        [
          {
            type: 'teamClassChanged',
            teamName: 'Team Alpha',
            fromClass: 'GT3',
            toClass: 'GTE',
            drivers: ['Alice', 'Bob', 'Charlie'],
          },
        ],
        appTitle,
        adminName
      )
      expect(embed.fields).toHaveLength(1)
      expect(embed.fields[0].name).toBe('🏎️ Car Class Changed')
      expect(embed.fields[0].value).toContain('**Team Alpha**: GT3 → GTE')
      expect(embed.fields[0].value).toContain('• Alice')
      expect(embed.fields[0].value).toContain('• Bob')
      expect(embed.fields[0].value).toContain('• Charlie')
    })

    it('groups team class changes with other changes', () => {
      const embed = buildRosterChangesEmbed(
        [
          { type: 'added', driverName: 'Dave', teamName: 'Team Beta' },
          {
            type: 'teamClassChanged',
            teamName: 'Team Alpha',
            fromClass: 'GT3',
            toClass: 'LMP2',
            drivers: ['Alice', 'Bob'],
          },
          { type: 'dropped', driverName: 'Eve', fromTeam: 'Team Gamma' },
        ],
        appTitle,
        adminName
      )
      expect(embed.description).toBe('3 changes made by **John Admin**')
      expect(embed.fields).toHaveLength(3)
      expect(embed.fields[0].name).toBe('✅ Added')
      expect(embed.fields[1].name).toBe('🏎️ Car Class Changed')
      expect(embed.fields[2].name).toBe('❌ Dropped')
    })
  })

  describe('buildJoinEventButton', () => {
    it('returns a link button with Join Event label', () => {
      const btn = buildJoinEventButton('https://example.com/events/1')
      expect(btn).toEqual({
        type: 2,
        style: 5,
        label: 'Join Event',
        url: 'https://example.com/events/1',
      })
    })
  })

  describe('buildMainEventThreadButton', () => {
    it('returns a link button with View Main Event Thread label', () => {
      const btn = buildMainEventThreadButton('https://discord.com/channels/123/456')
      expect(btn).toEqual({
        type: 2,
        style: 5,
        label: 'View Main Event Thread',
        url: 'https://discord.com/channels/123/456',
      })
    })
  })

  describe('parseDiscordErrorBody', () => {
    it('parses valid JSON response body', async () => {
      const response = {
        text: async () => '{"code": 50035, "message": "Invalid Form Body"}',
      } as Response
      const result = await parseDiscordErrorBody(response)
      expect(result).toEqual({ code: 50035, message: 'Invalid Form Body' })
    })

    it('returns raw text when response body is not valid JSON', async () => {
      const response = {
        text: async () => 'Internal Server Error',
      } as Response
      const result = await parseDiscordErrorBody(response)
      expect(result).toEqual({ raw: 'Internal Server Error' })
    })
  })
})
