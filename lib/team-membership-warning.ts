export function shouldWarnForTeamMembership(
  teamMemberCustomerIds: Set<number> | undefined,
  driverCustomerId: number | null | undefined
): boolean {
  if (!teamMemberCustomerIds || teamMemberCustomerIds.size === 0) {
    return false
  }

  if (typeof driverCustomerId !== 'number') {
    return true
  }

  return !teamMemberCustomerIds.has(driverCustomerId)
}

export function getTeamMembershipWarningMessage(params: {
  assignedTeamId: string | null | undefined
  assignedTeamName?: string | null
  driverCustomerId: number | null | undefined
  isManualDriver?: boolean
  teamMemberCustomerIdsById: Map<string, Set<number>>
  allSyncedTeamMemberCustomerIds: Set<number>
}): string | null {
  const {
    assignedTeamId,
    assignedTeamName,
    driverCustomerId,
    isManualDriver = false,
    teamMemberCustomerIdsById,
    allSyncedTeamMemberCustomerIds,
  } = params

  if (isManualDriver) {
    return null
  }

  if (assignedTeamId) {
    const assignedTeamMembers = teamMemberCustomerIdsById.get(assignedTeamId)
    if (assignedTeamMembers && assignedTeamMembers.size > 0) {
      if (shouldWarnForTeamMembership(assignedTeamMembers, driverCustomerId)) {
        const label = assignedTeamName || 'the assigned team'
        return `Not a member of ${label} on iRacing.`
      }
      return null
    }
  }

  if (shouldWarnForTeamMembership(allSyncedTeamMemberCustomerIds, driverCustomerId)) {
    return 'Not a member of any community iRacing team.'
  }

  return null
}
