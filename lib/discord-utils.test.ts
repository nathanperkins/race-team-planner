import { describe, it, expect } from 'vitest'
import {
  buildDiscordAppLink,
  buildDiscordWebLink,
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
  formatRaceTimesValue,
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

    it('formats unassigned members correctly', () => {
      const unassigned = [{ name: 'Charlie', carClass: 'GT3' }]
      const lines = formatTeamLines([], unassigned)
      expect(lines).toContain('**Unassigned**')
      expect(lines).toContain('• Charlie')
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
      expect(lines.filter((l) => l === '**Unassigned**')).toHaveLength(2)
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

  describe('buildEventThreadName', () => {
    it('builds thread name with normalized series and date', () => {
      const name = buildEventThreadName(
        'GT3 Fanatic Series - 2024 Season 1',
        new Date('2026-02-11T20:00:00Z'),
        { locale: 'en-US', timeZone: 'America/Los_Angeles' }
      )
      expect(name).toBe('GT3 Fanatic Series (2/11)')
    })

    it('uses defaults for locale and timezone', () => {
      const name = buildEventThreadName('IMSA', new Date('2026-02-11T20:00:00Z'))
      expect(name).toMatch(/IMSA \(\d+\/\d+\)/)
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
      expect(embed.title).toBe('🏎️ Event Thread: GT3 Challenge')
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
      expect(embeds[0].description).toContain('**Unassigned**')
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
      expect(embeds[0].description).toContain('**🏁 Classes:**')
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
      expect(desc).toContain('**Unassigned**')
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
      expect(embeds[0].description).toContain('**🏁 Classes:**')
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

      const discussionField = embed.fields.find((f: any) => f.name === '🔗 Discussion')
      expect(discussionField.value).toBe(
        '[View Event Thread](https://discord.com/channels/123/456)'
      )
    })
  })
})
