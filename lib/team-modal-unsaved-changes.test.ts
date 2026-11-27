import { describe, it, expect } from 'vitest'
import {
  createTeamModalBaseline,
  hasTeamModalPendingChanges,
  mergeServerRegistrationsIntoBaseline,
  type TeamModalRegistrationLike,
} from './team-modal-unsaved-changes'

const makeReg = (
  id: string,
  teamId: string | null,
  carClassId = 'class-1'
): TeamModalRegistrationLike => ({
  id,
  carClass: { id: carClassId },
  teamId,
  team: teamId ? { id: teamId } : null,
})

describe('team-modal-unsaved-changes', () => {
  const baseRegs = [makeReg('reg-1', 'team-1', 'class-1'), makeReg('reg-2', null, 'class-1')]

  const makeCleanParams = (
    overrides: Partial<Parameters<typeof hasTeamModalPendingChanges>[0]> = {}
  ) => ({
    baseline: createTeamModalBaseline({
      registrations: baseRegs,
      maxDrivers: 3,
      strategy: 'BALANCED_IRATING',
      raceSnapshot: 'snap-1',
    }),
    pendingRegistrations: baseRegs.map((reg) => ({ ...reg, carClass: { ...reg.carClass } })),
    pendingAdditionsCount: 0,
    pendingDropsCount: 0,
    extraTeamsCount: 0,
    revealedTeamIds: [],
    teamNameOverrides: {},
    emptyTeamCarClassOverrides: {},
    teamOrder: ['team-1', 'unassigned'],
    pendingMaxDrivers: 3,
    pendingStrategy: 'BALANCED_IRATING' as const,
    ...overrides,
  })

  it('returns false when baseline is null or no edits were made', () => {
    expect(hasTeamModalPendingChanges(makeCleanParams({ baseline: null }))).toBe(false)
    expect(hasTeamModalPendingChanges(makeCleanParams())).toBe(false)
  })

  it('tracks newly arrived server registrations: clean if untouched, dirty if edited', () => {
    const baseline = createTeamModalBaseline({
      registrations: baseRegs,
      maxDrivers: 3,
      strategy: 'BALANCED_IRATING',
      raceSnapshot: 'snap-1',
    })
    const serverReg = makeReg('reg-server', null, 'class-1')
    const serverAssignedReg = makeReg('reg-server-assigned', 'team-server', 'class-1')

    mergeServerRegistrationsIntoBaseline(baseline, [...baseRegs, serverReg, serverAssignedReg])

    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          baseline,
          pendingRegistrations: [...baseRegs, serverReg, serverAssignedReg],
          teamOrder: ['team-1', 'team-server', 'unassigned'],
        })
      )
    ).toBe(false)

    // Assigning the newly arrived server registration should be detected as dirty
    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          baseline,
          pendingRegistrations: [
            ...baseRegs,
            makeReg('reg-server', 'team-1', 'class-1'),
            serverAssignedReg,
          ],
          teamOrder: ['team-1', 'team-server', 'unassigned'],
        })
      )
    ).toBe(true)
  })

  it('detects driver team moves and car class changes, and clears when reverted', () => {
    const movedRegs = [makeReg('reg-1', 'team-2', 'class-1'), makeReg('reg-2', null, 'class-1')]
    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          pendingRegistrations: movedRegs,
          teamOrder: ['team-1', 'team-2', 'unassigned'],
        })
      )
    ).toBe(true)

    const unassignedRegs = [makeReg('reg-1', null, 'class-1'), makeReg('reg-2', null, 'class-1')]
    expect(
      hasTeamModalPendingChanges(makeCleanParams({ pendingRegistrations: unassignedRegs }))
    ).toBe(true)

    const classChangedRegs = [
      makeReg('reg-1', 'team-1', 'class-2'),
      makeReg('reg-2', null, 'class-1'),
    ]
    expect(
      hasTeamModalPendingChanges(makeCleanParams({ pendingRegistrations: classChangedRegs }))
    ).toBe(true)

    // Reverted back to original values
    const revertedRegs = [makeReg('reg-1', 'team-1', 'class-1'), makeReg('reg-2', null, 'class-1')]
    expect(
      hasTeamModalPendingChanges(makeCleanParams({ pendingRegistrations: revertedRegs }))
    ).toBe(false)
  })

  it('handles revealed baseline teams and empty team class overrides without false positives', () => {
    // Baseline team re-revealed and still empty -> dirty
    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          pendingRegistrations: [makeReg('reg-1', null), makeReg('reg-2', null)],
          revealedTeamIds: ['team-1'],
        })
      )
    ).toBe(true)

    // Baseline team re-revealed and repopulated back to baseline -> clean
    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          revealedTeamIds: ['team-1'],
        })
      )
    ).toBe(false)

    // Orphaned emptyTeamCarClassOverrides for a non-empty or removed team -> clean
    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          emptyTeamCarClassOverrides: { 'team-1': 'class-1', 'removed-team': 'class-2' },
        })
      )
    ).toBe(false)

    // Active empty visible team with class override -> dirty
    expect(
      hasTeamModalPendingChanges(
        makeCleanParams({
          teamOrder: ['team-1', 'team-2', 'unassigned'],
          emptyTeamCarClassOverrides: { 'team-2': 'class-2' },
        })
      )
    ).toBe(true)
  })

  it('detects additions, drops, added/swapped empty teams, overrides, and maxDrivers changes', () => {
    expect(hasTeamModalPendingChanges(makeCleanParams({ pendingAdditionsCount: 1 }))).toBe(true)
    expect(hasTeamModalPendingChanges(makeCleanParams({ pendingDropsCount: 1 }))).toBe(true)
    expect(hasTeamModalPendingChanges(makeCleanParams({ extraTeamsCount: 1 }))).toBe(true)
    expect(hasTeamModalPendingChanges(makeCleanParams({ revealedTeamIds: ['team-2'] }))).toBe(true)
    expect(
      hasTeamModalPendingChanges(makeCleanParams({ teamNameOverrides: { 'team-1': 'Renamed' } }))
    ).toBe(true)
    expect(
      hasTeamModalPendingChanges(makeCleanParams({ teamOrder: ['team-1', 'team-2', 'unassigned'] }))
    ).toBe(true)
    expect(hasTeamModalPendingChanges(makeCleanParams({ pendingMaxDrivers: 2 }))).toBe(true)
    expect(hasTeamModalPendingChanges(makeCleanParams({ pendingMaxDrivers: null }))).toBe(true)
  })
})
