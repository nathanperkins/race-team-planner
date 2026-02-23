import { describe, expect, it } from 'vitest'
import {
  buildRosterChangesFromTeamChangeDetails,
  buildTeamChangeDetails,
  buildTeamChangeSummary,
} from './team-change-summary'

// Regression tests for GitHub issue #133:
// When a new driver was added as unassigned (no previous snapshot),
// buildTeamChangeDetails returned early without creating a change record.
// This caused the team picker confirmation dialog to show "No changes detected"
// and prevented Discord notifications from firing.
describe('buildTeamChangeDetails - new unassigned registration (issue #133)', () => {
  it('detects new unassigned driver as an added change', () => {
    const details = buildTeamChangeDetails({
      originalRecords: [],
      pendingRecords: [
        { id: 'reg-1', driverName: 'User 1', teamId: null, teamName: null, carClassName: 'GT3' },
      ],
      teamNameById: new Map(),
    })

    expect(details).toHaveLength(1)
    expect(details[0]).toMatchObject({
      type: 'added',
      driverName: 'User 1',
      toTeamId: null,
      toTeamName: 'Unassigned',
      destructive: false,
    })
  })

  it('shows new unassigned driver in buildTeamChangeSummary teamChanges', () => {
    const summary = buildTeamChangeSummary({
      originalRecords: [],
      pendingRecords: [
        { id: 'reg-1', driverName: 'User 1', teamId: null, teamName: null, carClassName: 'GT3' },
      ],
      existingThreads: null,
      teamNameById: new Map(),
      newlyFormedTeamNames: [],
    })

    // Should NOT say "No changes detected"
    expect(
      summary.teamChanges.length === 0 &&
        summary.newlyFormedTeams.length === 0 &&
        summary.destructiveChanges.length === 0 &&
        summary.discordThreadsToCreate.length === 0
    ).toBe(false)
    // Should mention the driver name in teamChanges
    expect(summary.teamChanges.some((line) => line.includes('User 1'))).toBe(true)
  })
})

describe('buildTeamChangeSummary', () => {
  it('includes dropped unassigned drivers as destructive changes', () => {
    const summary = buildTeamChangeSummary({
      originalRecords: [
        {
          id: 'reg-1',
          driverName: 'Steven',
          teamId: null,
          teamName: null,
          carClassName: 'GT3',
        },
      ],
      pendingRecords: [],
      existingThreads: null,
      teamNameById: new Map(),
      newlyFormedTeamNames: [],
    })

    expect(summary.destructiveChanges).toContain('Dropped Steven from Unassigned.')
  })

  it('builds roster changes from the same detail set', () => {
    const teamNameById = new Map([
      ['team-1', 'Carbon'],
      ['team-2', 'Cobalt'],
    ])
    const details = buildTeamChangeDetails({
      teamNameById,
      originalRecords: [
        {
          id: 'reg-1',
          driverName: 'Steven',
          teamId: null,
          teamName: null,
          carClassName: 'GT3',
        },
        {
          id: 'reg-2',
          driverName: 'Bob',
          teamId: 'team-1',
          teamName: 'Carbon',
          carClassName: 'GT3',
        },
      ],
      pendingRecords: [
        {
          id: 'reg-1',
          driverName: 'Steven',
          teamId: 'team-1',
          teamName: 'Carbon',
          carClassName: 'GT3',
        },
        {
          id: 'reg-2',
          driverName: 'Bob',
          teamId: 'team-2',
          teamName: 'Cobalt',
          carClassName: 'GT3',
        },
      ],
    })

    const rosterChanges = buildRosterChangesFromTeamChangeDetails(details)

    expect(rosterChanges).toEqual(
      expect.arrayContaining([
        { type: 'added', driverName: 'Steven', teamName: 'Carbon' },
        { type: 'moved', driverName: 'Bob', fromTeam: 'Carbon', toTeam: 'Cobalt' },
      ])
    )
  })

  it('groups team class changes with affected drivers', () => {
    const teamNameById = new Map([['team-1', 'Carbon']])
    const details = buildTeamChangeDetails({
      teamNameById,
      originalRecords: [
        {
          id: 'reg-1',
          driverName: 'Alice',
          teamId: 'team-1',
          teamName: 'Carbon',
          carClassName: 'LMP2',
        },
        {
          id: 'reg-2',
          driverName: 'Bob',
          teamId: 'team-1',
          teamName: 'Carbon',
          carClassName: 'LMP2',
        },
      ],
      pendingRecords: [
        {
          id: 'reg-1',
          driverName: 'Alice',
          teamId: 'team-1',
          teamName: 'Carbon',
          carClassName: 'GTP',
        },
        {
          id: 'reg-2',
          driverName: 'Bob',
          teamId: 'team-1',
          teamName: 'Carbon',
          carClassName: 'GTP',
        },
      ],
    })

    const rosterChanges = buildRosterChangesFromTeamChangeDetails(details)
    expect(rosterChanges).toContainEqual({
      type: 'teamClassChanged',
      teamName: 'Carbon',
      fromClass: 'LMP2',
      toClass: 'GTP',
      drivers: ['Alice', 'Bob'],
    })
  })
})
