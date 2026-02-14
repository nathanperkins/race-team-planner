import { describe, expect, it } from 'vitest'
import {
  buildRosterChangesFromTeamChangeDetails,
  buildTeamChangeDetails,
  buildTeamChangeSummary,
} from './team-change-summary'

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
