export interface TeamModalRegistrationLike {
  id: string
  carClass: { id: string }
  teamId?: string | null
  team?: { id: string } | null
}

export interface TeamModalBaseline<
  TReg extends TeamModalRegistrationLike = TeamModalRegistrationLike,
> {
  registrations: TReg[]
  registrationsById: Map<string, { teamId: string | null; carClassId: string }>
  assignedTeamIds: Set<string>
  maxDrivers: number | null
  strategy: 'BALANCED_IRATING'
  raceSnapshot: string
}

/**
 * Captures the modal's baseline state at open time so pending edits can be
 * accurately detected and cleanly discarded without false positives.
 */
export function createTeamModalBaseline<TReg extends TeamModalRegistrationLike>(params: {
  registrations: TReg[]
  maxDrivers: number | null
  strategy: 'BALANCED_IRATING'
  raceSnapshot: string
}): TeamModalBaseline<TReg> {
  const registrationsById = new Map<string, { teamId: string | null; carClassId: string }>()
  const assignedTeamIds = new Set<string>()

  params.registrations.forEach((reg) => {
    const teamId = reg.teamId ?? reg.team?.id ?? null
    registrationsById.set(reg.id, { teamId, carClassId: reg.carClass.id })
    if (teamId) {
      assignedTeamIds.add(teamId)
    }
  })

  return {
    registrations: params.registrations,
    registrationsById,
    assignedTeamIds,
    maxDrivers: params.maxDrivers,
    strategy: params.strategy,
    raceSnapshot: params.raceSnapshot,
  }
}

/**
 * Records newly arrived server registrations into an open modal's baseline so
 * untouched server arrivals stay clean while admin edits to them are detected.
 */
export function mergeServerRegistrationsIntoBaseline<TReg extends TeamModalRegistrationLike>(
  baseline: TeamModalBaseline<TReg> | null,
  incomingRegistrations: TReg[]
): void {
  if (!baseline) return
  for (const reg of incomingRegistrations) {
    if (baseline.registrationsById.has(reg.id)) continue
    const teamId = reg.teamId ?? reg.team?.id ?? null
    baseline.registrationsById.set(reg.id, { teamId, carClassId: reg.carClass.id })
    if (teamId) {
      baseline.assignedTeamIds.add(teamId)
    }
  }
}

/**
 * Returns true if the Assign Teams modal has any unapplied edits compared to
 * the baseline captured when the modal opened. Ignores UI-only state such as
 * team lock toggles, search queries, and pre-existing missing Discord threads.
 */
export function hasTeamModalPendingChanges(params: {
  baseline: TeamModalBaseline | null
  pendingRegistrations: TeamModalRegistrationLike[]
  pendingAdditionsCount: number
  pendingDropsCount: number
  extraTeamsCount: number
  revealedTeamIds: string[]
  teamNameOverrides: Record<string, string>
  emptyTeamCarClassOverrides: Record<string, string>
  teamOrder: string[]
  pendingMaxDrivers: number | null
  pendingStrategy: 'BALANCED_IRATING'
}): boolean {
  const {
    baseline,
    pendingRegistrations,
    pendingAdditionsCount,
    pendingDropsCount,
    extraTeamsCount,
    revealedTeamIds,
    teamNameOverrides,
    emptyTeamCarClassOverrides,
    teamOrder,
    pendingMaxDrivers,
    pendingStrategy,
  } = params

  if (!baseline) return false

  if (pendingAdditionsCount > 0) return true
  if (pendingDropsCount > 0) return true
  if (extraTeamsCount > 0) return true
  if (Object.keys(teamNameOverrides).length > 0) return true
  if (pendingMaxDrivers !== baseline.maxDrivers) return true
  if (pendingStrategy !== baseline.strategy) return true

  const activeTeamIdsWithDrivers = new Set<string>()
  for (const reg of pendingRegistrations) {
    const currentTeamId = reg.teamId ?? reg.team?.id ?? null
    if (currentTeamId) {
      activeTeamIdsWithDrivers.add(currentTeamId)
    }

    const initial = baseline.registrationsById.get(reg.id)
    if (!initial) continue
    if (currentTeamId !== initial.teamId || reg.carClass.id !== initial.carClassId) {
      return true
    }
  }

  for (const teamId of revealedTeamIds) {
    if (!activeTeamIdsWithDrivers.has(teamId) || !baseline.assignedTeamIds.has(teamId)) {
      return true
    }
  }

  const visibleEmptyTeamIds = new Set<string>()
  for (const teamId of teamOrder) {
    if (teamId !== 'unassigned' && !activeTeamIdsWithDrivers.has(teamId)) {
      visibleEmptyTeamIds.add(teamId)
      if (!baseline.assignedTeamIds.has(teamId)) {
        return true
      }
    }
  }

  for (const teamId of Object.keys(emptyTeamCarClassOverrides)) {
    if (visibleEmptyTeamIds.has(teamId)) {
      return true
    }
  }

  return false
}
