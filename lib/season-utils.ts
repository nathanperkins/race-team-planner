/**
 * Utility functions for determining iRacing season/week information from dates.
 *
 * iRacing seasons typically consist of 13 weeks (12 official + 1 fun/transition).
 * Reference Anchor: 2025 Season 1 started on Tuesday, Dec 10, 2024 at 00:00 UTC.
 */

export interface IracingSeasonInfo {
  seasonYear: number
  seasonQuarter: number // 1-4
  raceWeek: number // 1-13
  weekStart: Date // Tuesday 00:00 UTC
  weekEnd: Date // Monday 23:59:59 UTC
}

// Anchor Date: Start of 2025 Season 1 -> 2024-12-17T00:00:00Z (Adjusted to align with observed schedule)
const ANCHOR_DATE = new Date('2024-12-17T00:00:00Z')
const ANCHOR_YEAR = 2025
const ANCHOR_QUARTER = 1 // 1-based

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export function getIracingSeasonInfo(date: Date): IracingSeasonInfo {
  const d = new Date(date)
  const diff = d.getTime() - ANCHOR_DATE.getTime()

  // Calculate total weeks elapsed since anchor
  // Use floor to find the completed weeks
  const totalWeeks = Math.floor(diff / MS_PER_WEEK)

  // iRacing seasons are 13 weeks long
  const totalSeasons = Math.floor(totalWeeks / 13)

  // Calculate current season info
  const seasonYear = ANCHOR_YEAR + Math.floor((ANCHOR_QUARTER - 1 + totalSeasons) / 4)
  const seasonQuarter = ((ANCHOR_QUARTER - 1 + totalSeasons) % 4) + 1
  const raceWeek = (totalWeeks % 13) + 1

  // Handle negative difference (dates before anchor)
  if (diff < 0) {
    throw new Error('Dates before the anchor date are not supported.')
  }

  // Calculate Week Start/End
  // Week Start = Anchor + (totalWeeks * MS_PER_WEEK)
  const weekStartTime = ANCHOR_DATE.getTime() + totalWeeks * MS_PER_WEEK
  const weekStart = new Date(weekStartTime)
  const weekEnd = new Date(weekStartTime + MS_PER_WEEK - 1)

  return {
    seasonYear,
    seasonQuarter,
    raceWeek,
    weekStart,
    weekEnd,
  }
}
