import { describe, it, expect } from 'vitest'
import {
  buildDiscordAppLink,
  buildDiscordWebLink,
  normalizeSeriesName,
  chunkLines,
  formatTeamLines,
  buildWeeklyScheduleEmbeds,
  buildRegistrationEmbed,
  buildOnboardingEmbed,
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
})
