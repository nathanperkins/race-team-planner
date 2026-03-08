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
