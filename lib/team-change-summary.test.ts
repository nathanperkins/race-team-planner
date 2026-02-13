import { describe, expect, it } from 'vitest'
import { buildTeamChangeSummary } from './team-change-summary'

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
})
