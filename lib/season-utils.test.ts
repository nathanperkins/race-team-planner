import { describe, it, expect } from 'vitest'
import { getIracingSeasonInfo } from './season-utils'

describe('getIracingSeasonInfo', () => {
  it('correctly identifies the start of 2025 Season 1 (Anchor)', () => {
    const date = new Date('2024-12-17T00:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2025)
    expect(result.seasonQuarter).toBe(1)
    expect(result.raceWeek).toBe(1)
    expect(result.weekStart.toISOString()).toBe('2024-12-17T00:00:00.000Z')
  })

  it('correctly identifies a mid-week date in Week 1', () => {
    const date = new Date('2024-12-20T12:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2025)
    expect(result.seasonQuarter).toBe(1)
    expect(result.raceWeek).toBe(1)
    expect(result.weekStart.toISOString()).toBe('2024-12-17T00:00:00.000Z')
  })

  it('correctly identifies the start of Week 2', () => {
    const date = new Date('2024-12-24T00:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2025)
    expect(result.seasonQuarter).toBe(1)
    expect(result.raceWeek).toBe(2)
  })

  it('correctly identifies Week 13 (Transition Week)', () => {
    const date = new Date('2025-03-11T00:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2025)
    expect(result.seasonQuarter).toBe(1)
    // Week 13 is the 13th week
    expect(result.raceWeek).toBe(13)
  })

  it('correctly identifies the start of 2025 Season 2', () => {
    const date = new Date('2025-03-18T00:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2025)
    expect(result.seasonQuarter).toBe(2)
    expect(result.raceWeek).toBe(1)
  })

  it('correctly identifies an observed event in late S1 2026', () => {
    const date = new Date('2026-03-06T19:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2026)
    expect(result.seasonQuarter).toBe(1)
    expect(result.raceWeek).toBe(12)
  })

  it('correctly identifies start of 2026 Season 2', () => {
    const date = new Date('2026-03-17T00:00:00Z')
    const result = getIracingSeasonInfo(date)

    expect(result.seasonYear).toBe(2026)
    expect(result.seasonQuarter).toBe(2)
    expect(result.raceWeek).toBe(1)
  })
})
