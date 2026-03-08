import { describe, expect, it } from 'vitest'
import { shouldWarnForTeamMembership } from './team-membership-warning'

describe('shouldWarnForTeamMembership', () => {
  it('does not warn when team has no roster data', () => {
    expect(shouldWarnForTeamMembership(undefined, 12345)).toBe(false)
    expect(shouldWarnForTeamMembership(new Set(), 12345)).toBe(false)
  })

  it('does not warn when driver is on team roster', () => {
    expect(shouldWarnForTeamMembership(new Set([12345, 67890]), 12345)).toBe(false)
  })

  it('warns when driver is not on team roster', () => {
    expect(shouldWarnForTeamMembership(new Set([12345, 67890]), 99999)).toBe(true)
  })

  it('warns when driver has no iRacing customer id but team has roster data', () => {
    expect(shouldWarnForTeamMembership(new Set([12345, 67890]), null)).toBe(true)
    expect(shouldWarnForTeamMembership(new Set([12345, 67890]), undefined)).toBe(true)
  })
})
