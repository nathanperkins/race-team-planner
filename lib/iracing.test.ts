import { describe, expect, it } from 'vitest'
import { transformSeasonsToEvents } from './iracing'

// Helper to build a minimal season that matches the "team endurance" criteria
function makeSeason(overrides: Record<string, unknown> = {}) {
  return {
    series_id: 1,
    season_id: 100,
    season_name: 'Endurance Series',
    driver_changes: true,
    max_team_drivers: 4,
    car_class_ids: [42],
    license_group: 4,
    schedule_description: 'Test endurance series',
    schedules: [],
    ...overrides,
  }
}

// Helper to build a schedule week with session_times
function makeWeek(overrides: Record<string, unknown> = {}) {
  return {
    race_week_num: 1,
    start_date: '2099-01-01T00:00:00Z',
    week_end_time: '2099-01-08T00:00:00Z',
    race_time_limit: 120,
    practice_length: 3,
    qualify_length: 8,
    warmup_length: 0,
    track: { track_name: 'Daytona', config_name: 'Oval' },
    race_time_descriptors: [
      {
        session_minutes: 134,
        session_times: ['2099-01-05T14:00:00Z', '2099-01-05T18:00:00Z'],
      },
    ],
    ...overrides,
  }
}

// A fixed "now" that falls between start_date and week_end_time
const NOW = new Date('2099-01-03T00:00:00Z')

describe('transformSeasonsToEvents', () => {
  describe('race end time', () => {
    it('uses session_minutes for race end time, not race_time_limit', () => {
      // session_minutes=134 (full session), race_time_limit=120 (race only)
      const season = makeSeason({ schedules: [makeWeek()] })
      const events = transformSeasonsToEvents([season], NOW)

      expect(events).toHaveLength(1)
      const race = events[0].races[0]
      const start = new Date(race.startTime)
      const end = new Date(race.endTime)
      const durationMs = end.getTime() - start.getTime()
      const durationMins = durationMs / 60000

      // Should be 134 (session_minutes), not 120 (race_time_limit)
      expect(durationMins).toBe(134)
    })

    it('falls back to race_time_limit for end time when session_minutes is missing', () => {
      const week = makeWeek({
        race_time_descriptors: [
          {
            // No session_minutes
            session_times: ['2099-01-05T14:00:00Z'],
          },
        ],
      })
      const season = makeSeason({ schedules: [week] })
      const events = transformSeasonsToEvents([season], NOW)

      const race = events[0].races[0]
      const durationMins =
        (new Date(race.endTime).getTime() - new Date(race.startTime).getTime()) / 60000

      // Falls back to race_time_limit=120
      expect(durationMins).toBe(120)
    })

    it('falls back to 60 min when neither session_minutes nor race_time_limit is set', () => {
      const week = makeWeek({
        race_time_limit: null,
        race_time_descriptors: [
          {
            session_times: ['2099-01-05T14:00:00Z'],
          },
        ],
      })
      const season = makeSeason({ schedules: [week] })
      const events = transformSeasonsToEvents([season], NOW)

      const race = events[0].races[0]
      const durationMins =
        (new Date(race.endTime).getTime() - new Date(race.startTime).getTime()) / 60000

      expect(durationMins).toBe(60)
    })
  })

  describe('durationMins (race duration for display)', () => {
    it('uses race_time_limit for durationMins, not session_minutes', () => {
      const season = makeSeason({ schedules: [makeWeek()] })
      const events = transformSeasonsToEvents([season], NOW)

      // durationMins should reflect the race length only (120), not the full session (134)
      expect(events[0].durationMins).toBe(120)
    })

    it('falls back to session_minutes for durationMins when race_time_limit is missing', () => {
      const week = makeWeek({ race_time_limit: null })
      const season = makeSeason({ schedules: [week] })
      const events = transformSeasonsToEvents([season], NOW)

      expect(events[0].durationMins).toBe(134)
    })
  })

  describe('fallback path (no session_times)', () => {
    it('uses session_minutes for end time when there are no session_times', () => {
      const week = makeWeek({
        race_time_descriptors: [
          {
            session_minutes: 134,
            // No session_times — triggers the fallback path
          },
        ],
      })
      const season = makeSeason({ schedules: [week] })
      const events = transformSeasonsToEvents([season], NOW)

      expect(events).toHaveLength(1)
      const race = events[0].races[0]
      const durationMins =
        (new Date(race.endTime).getTime() - new Date(race.startTime).getTime()) / 60000

      expect(durationMins).toBe(134)
    })
  })

  describe('event end time', () => {
    it('event endTime is the end of the last race (which uses session_minutes)', () => {
      const season = makeSeason({ schedules: [makeWeek()] })
      const events = transformSeasonsToEvents([season], NOW)

      // The last race starts at 18:00 and should end 134 min later = 20:14
      const expectedEnd = new Date('2099-01-05T18:00:00Z')
      expectedEnd.setMinutes(expectedEnd.getMinutes() + 134)

      expect(new Date(events[0].endTime).getTime()).toBe(expectedEnd.getTime())
    })
  })
})
