export type TeamSnapshot = Record<string, string | null>

export interface MentionCandidate {
  id: string
  hasDiscord: boolean
}

export interface TeamChangeRecord {
  id: string
  driverName: string
  teamId: string | null
  teamName?: string | null
  carClassName: string
}

export interface TeamChangeSummary {
  teamChanges: string[]
  newlyFormedTeams: string[]
  destructiveChanges: string[]
  discordThreadsToCreate: string[]
}

export type TeamChangeType =
  | 'added'
  | 'moved'
  | 'dropped'
  | 'class_changed'
  | 'team_renamed'
  | 'team_class_changed'

export interface TeamChangeDetail {
  registrationId: string
  driverName: string
  type: TeamChangeType
  fromTeamId: string | null
  toTeamId: string | null
  fromTeamName: string
  toTeamName: string
  line: string
  destructive: boolean
}

export function buildTeamSnapshot(
  registrations: Array<{ id: string; teamId?: string | null; team?: { id: string } | null }>
): TeamSnapshot {
  const snapshot: TeamSnapshot = {}
  registrations.forEach((reg) => {
    snapshot[reg.id] = reg.teamId ?? reg.team?.id ?? null
  })
  return snapshot
}

export function computeMentionRegistrationIds(params: {
  previousSnapshot: TeamSnapshot | null
  currentSnapshot: TeamSnapshot
  candidates: MentionCandidate[]
}): string[] {
  const { previousSnapshot, currentSnapshot, candidates } = params
  const mentionIds = new Set<string>()

  if (!previousSnapshot) {
    candidates.forEach((candidate) => {
      if (candidate.hasDiscord) {
        mentionIds.add(candidate.id)
      }
    })
    return Array.from(mentionIds)
  }

  Object.entries(currentSnapshot).forEach(([regId, teamId]) => {
    if (!(regId in previousSnapshot)) {
      mentionIds.add(regId)
      return
    }
    if (previousSnapshot[regId] !== teamId) {
      mentionIds.add(regId)
    }
  })

  return Array.from(mentionIds)
}

export function buildTeamChangeSummary(params: {
  originalRecords: TeamChangeRecord[]
  pendingRecords: TeamChangeRecord[]
  existingThreads: Record<string, string> | null
  teamNameById: Map<string, string>
  newlyFormedTeamNames?: string[]
}): TeamChangeSummary {
  const { originalRecords, pendingRecords, existingThreads, teamNameById, newlyFormedTeamNames } =
    params
  const getTeamName = (
    teamId: string | null,
    fallback?: string | null,
    defaultLabel = 'Unassigned'
  ) => (teamId ? teamNameById.get(teamId) || fallback || 'Team' : defaultLabel)
  const details = buildTeamChangeDetails({ originalRecords, pendingRecords, teamNameById })
  const teamAdded = new Map<string, Set<string>>()
  const destructiveLines = new Set<string>()

  details.forEach((detail) => {
    if (detail.type === 'added') {
      const existing = teamAdded.get(detail.toTeamName) ?? new Set<string>()
      existing.add(detail.driverName)
      teamAdded.set(detail.toTeamName, existing)
      return
    }
    if (detail.destructive) {
      destructiveLines.add(detail.line)
    }
  })

  const listNames = (names: string[]) => {
    if (names.length <= 1) return names[0] || ''
    if (names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  }

  const teamChanges: string[] = []
  const addedTeams = Array.from(teamAdded.keys()).sort((a, b) => a.localeCompare(b))
  addedTeams.forEach((teamName) => {
    const drivers = Array.from(teamAdded.get(teamName) ?? []).sort((a, b) => a.localeCompare(b))
    if (drivers.length > 0) {
      teamChanges.push(`Added ${listNames(drivers)} to ${teamName}.`)
    }
  })

  const teamsNeedingThreads = new Set<string>()
  pendingRecords.forEach((reg) => {
    if (!reg.teamId) return
    if (existingThreads?.[reg.teamId]) return
    teamsNeedingThreads.add(getTeamName(reg.teamId, reg.teamName, 'Team'))
  })

  return {
    teamChanges,
    newlyFormedTeams: (newlyFormedTeamNames ?? []).slice().sort((a, b) => a.localeCompare(b)),
    destructiveChanges: Array.from(destructiveLines).sort((a, b) => a.localeCompare(b)),
    discordThreadsToCreate: Array.from(teamsNeedingThreads).sort((a, b) => a.localeCompare(b)),
  }
}

export function buildTeamChangeDetails(params: {
  originalRecords: TeamChangeRecord[]
  pendingRecords: TeamChangeRecord[]
  teamNameById: Map<string, string>
}): TeamChangeDetail[] {
  const { originalRecords, pendingRecords, teamNameById } = params

  const getTeamName = (
    teamId: string | null,
    fallback?: string | null,
    defaultLabel = 'Unassigned'
  ) => (teamId ? teamNameById.get(teamId) || fallback || 'Team' : defaultLabel)

  const originalById = new Map(originalRecords.map((reg) => [reg.id, reg]))
  const pendingById = new Map(pendingRecords.map((reg) => [reg.id, reg]))
  const allIds = new Set<string>([...originalById.keys(), ...pendingById.keys()])
  const details: TeamChangeDetail[] = []
  const originalTeamMembers = new Map<string, Set<string>>()
  const pendingTeamMembers = new Map<string, Set<string>>()
  const originalTeamNameById = new Map<string, string>()
  const pendingTeamNameById = new Map<string, string>()
  const originalTeamClassValues = new Map<string, Set<string>>()
  const pendingTeamClassValues = new Map<string, Set<string>>()
  const pushTeamMember = (map: Map<string, Set<string>>, teamId: string, regId: string) => {
    const existing = map.get(teamId) ?? new Set<string>()
    existing.add(regId)
    map.set(teamId, existing)
  }
  const pushTeamClass = (map: Map<string, Set<string>>, teamId: string, className: string) => {
    const existing = map.get(teamId) ?? new Set<string>()
    existing.add(className)
    map.set(teamId, existing)
  }
  const haveSameMembers = (left: Set<string>, right: Set<string>) => {
    if (left.size !== right.size) return false
    for (const value of left) {
      if (!right.has(value)) return false
    }
    return true
  }

  originalRecords.forEach((reg) => {
    if (!reg.teamId) return
    pushTeamMember(originalTeamMembers, reg.teamId, reg.id)
    if (reg.teamName) {
      originalTeamNameById.set(reg.teamId, reg.teamName)
    }
    pushTeamClass(originalTeamClassValues, reg.teamId, reg.carClassName)
  })
  pendingRecords.forEach((reg) => {
    if (!reg.teamId) return
    pushTeamMember(pendingTeamMembers, reg.teamId, reg.id)
    if (reg.teamName) {
      pendingTeamNameById.set(reg.teamId, reg.teamName)
    }
    pushTeamClass(pendingTeamClassValues, reg.teamId, reg.carClassName)
  })

  const stableTeamIds = new Set<string>()
  originalTeamMembers.forEach((originalMembers, teamId) => {
    const pendingMembers = pendingTeamMembers.get(teamId)
    if (!pendingMembers) return
    if (!haveSameMembers(originalMembers, pendingMembers)) return
    stableTeamIds.add(teamId)
  })

  stableTeamIds.forEach((teamId) => {
    const oldTeamName = originalTeamNameById.get(teamId) || teamNameById.get(teamId) || 'Team'
    const newTeamName =
      teamNameById.get(teamId) || pendingTeamNameById.get(teamId) || oldTeamName || 'Team'
    if (oldTeamName !== newTeamName) {
      details.push({
        registrationId: `team:${teamId}`,
        driverName: oldTeamName,
        type: 'team_renamed',
        fromTeamId: teamId,
        toTeamId: teamId,
        fromTeamName: oldTeamName,
        toTeamName: newTeamName,
        line: `${oldTeamName} renamed to ${newTeamName}.`,
        destructive: false,
      })
    }

    const oldClassValues = Array.from(originalTeamClassValues.get(teamId) ?? [])
    const newClassValues = Array.from(pendingTeamClassValues.get(teamId) ?? [])
    const oldClass = oldClassValues.length === 1 ? oldClassValues[0] : null
    const newClass = newClassValues.length === 1 ? newClassValues[0] : null
    if (oldClass && newClass && oldClass !== newClass) {
      details.push({
        registrationId: `team-class:${teamId}`,
        driverName: oldTeamName,
        type: 'team_class_changed',
        fromTeamId: teamId,
        toTeamId: teamId,
        fromTeamName: oldTeamName,
        toTeamName: newTeamName,
        line: `${oldTeamName} car class changed from ${oldClass} to ${newClass}.`,
        destructive: true,
      })
    }
  })

  allIds.forEach((id) => {
    const original = originalById.get(id)
    const pending = pendingById.get(id)

    if (original && pending) {
      const fromTeamId = original.teamId
      const toTeamId = pending.teamId
      const fromTeamName = getTeamName(fromTeamId, original.teamName)
      const toTeamName = getTeamName(toTeamId, pending.teamName)
      const driverName = pending.driverName

      if (fromTeamId !== toTeamId) {
        if (fromTeamId && toTeamId) {
          details.push({
            registrationId: id,
            driverName,
            type: 'moved',
            fromTeamId,
            toTeamId,
            fromTeamName,
            toTeamName,
            line: `Moved ${driverName} from ${fromTeamName} to ${toTeamName}.`,
            destructive: true,
          })
        } else if (!fromTeamId && toTeamId) {
          details.push({
            registrationId: id,
            driverName,
            type: 'added',
            fromTeamId,
            toTeamId,
            fromTeamName,
            toTeamName,
            line: `Added ${driverName} to ${toTeamName}.`,
            destructive: false,
          })
        } else if (fromTeamId && !toTeamId) {
          details.push({
            registrationId: id,
            driverName,
            type: 'dropped',
            fromTeamId,
            toTeamId,
            fromTeamName,
            toTeamName,
            line: `Dropped ${driverName} from ${fromTeamName}.`,
            destructive: true,
          })
        }
      }

      if (original.carClassName !== pending.carClassName) {
        const unchangedTeamId =
          fromTeamId && toTeamId && fromTeamId === toTeamId ? fromTeamId : null
        if (unchangedTeamId && stableTeamIds.has(unchangedTeamId)) {
          return
        }
        details.push({
          registrationId: id,
          driverName,
          type: 'class_changed',
          fromTeamId,
          toTeamId,
          fromTeamName,
          toTeamName,
          line: `Changed ${pending.driverName} from ${original.carClassName} to ${pending.carClassName}.`,
          destructive: true,
        })
      }
      return
    }

    if (original && !pending) {
      const fromTeamName = getTeamName(original.teamId, original.teamName)
      details.push({
        registrationId: id,
        driverName: original.driverName,
        type: 'dropped',
        fromTeamId: original.teamId,
        toTeamId: null,
        fromTeamName,
        toTeamName: 'Unassigned',
        line: `Dropped ${original.driverName} from ${fromTeamName}.`,
        destructive: true,
      })
      return
    }

    if (!original && pending) {
      if (!pending.teamId) return
      const toTeamName = getTeamName(pending.teamId, pending.teamName)
      details.push({
        registrationId: id,
        driverName: pending.driverName,
        type: 'added',
        fromTeamId: null,
        toTeamId: pending.teamId,
        fromTeamName: 'Unassigned',
        toTeamName,
        line: `Added ${pending.driverName} to ${toTeamName}.`,
        destructive: false,
      })
    }
  })

  return details.sort((a, b) => a.line.localeCompare(b.line))
}
