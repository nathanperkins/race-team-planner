import { describe, expect, it } from 'vitest'
import {
  getTeamMembershipWarningMessage,
  shouldWarnForTeamMembership,
} from './team-membership-warning'

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

describe('getTeamMembershipWarningMessage', () => {
  const teamMemberCustomerIdsById = new Map<string, Set<number>>([
    ['team-a', new Set([101, 102])],
    ['team-b', new Set([201])],
    ['team-unsynced', new Set()],
  ])
  const allSyncedTeamMemberCustomerIds = new Set([101, 102, 201])

  it('returns null when no teams have synced rosters', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: null,
        driverCustomerId: 999,
        teamMemberCustomerIdsById: new Map(),
        allSyncedTeamMemberCustomerIds: new Set(),
      })
    ).toBeNull()
  })

  it('returns null for manual drivers', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: 'team-a',
        assignedTeamName: 'Team A',
        driverCustomerId: null,
        isManualDriver: true,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBeNull()
  })

  it('warns for unassigned driver missing from all community teams', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: null,
        driverCustomerId: 999,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBe('Not a member of any community iRacing team.')
  })

  it('returns null for unassigned driver who belongs to at least one community team', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: null,
        driverCustomerId: 201,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBeNull()
  })

  it('warns with team name when assigned to a synced team they do not belong to', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: 'team-a',
        assignedTeamName: 'SRG Alpha',
        driverCustomerId: 201,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBe('Not a member of SRG Alpha on iRacing.')
  })

  it('returns null when assigned to a synced team they belong to', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: 'team-a',
        assignedTeamName: 'SRG Alpha',
        driverCustomerId: 101,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBeNull()
  })

  it('falls back to community team check when assigned to an unsynced team', () => {
    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: 'team-unsynced',
        assignedTeamName: 'Custom Squad',
        driverCustomerId: 999,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBe('Not a member of any community iRacing team.')

    expect(
      getTeamMembershipWarningMessage({
        assignedTeamId: 'team-unsynced',
        assignedTeamName: 'Custom Squad',
        driverCustomerId: 101,
        teamMemberCustomerIdsById,
        allSyncedTeamMemberCustomerIds,
      })
    ).toBeNull()
  })
})
