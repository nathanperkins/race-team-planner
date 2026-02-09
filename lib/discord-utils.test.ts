import { describe, it, expect } from 'vitest'
import {
  normalizeSeriesName,
  chunkLines,
  formatTeamLines,
  buildWeeklyScheduleEmbeds,
} from './discord-utils'

describe('Discord Utils', () => {
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
})
