'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { fetchTeamInfo, fetchTeamMembers } from '@/lib/iracing'
import { createLogger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

const logger = createLogger('admin-teams-actions')

export async function getTeams() {
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      teamMembers: {
        select: {
          id: true,
        },
      },
    },
  })

  // Return teams with member counts from database (teamMembers, not User members)
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    alias: team.alias,
    iracingTeamId: team.iracingTeamId,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    memberCount: team.teamMembers.length,
  }))
}

export async function syncTeamMembers(teamId: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
  })

  if (!team) {
    throw new Error('Team not found')
  }

  // Fetch latest members from iRacing
  const iracingMembers = await fetchTeamMembers(team.iracingTeamId)

  // Delete existing roles for this team
  await prisma.teamMemberRole.deleteMany({
    where: { teamId: team.id },
  })

  // Disconnect all team members from this team
  await prisma.team.update({
    where: { id: team.id },
    data: {
      teamMembers: {
        set: [],
      },
    },
  })

  // Process each member from iRacing
  for (const member of iracingMembers) {
    // Find or create TeamMember
    let teamMember = await prisma.teamMember.findUnique({
      where: { custId: member.custId },
    })

    if (!teamMember) {
      teamMember = await prisma.teamMember.create({
        data: {
          custId: member.custId,
          displayName: member.displayName,
        },
      })
    }

    // Create role for this team
    await prisma.teamMemberRole.create({
      data: {
        teamMemberId: teamMember.id,
        teamId: team.id,
        isOwner: member.owner || false,
        isAdmin: member.admin || false,
      },
    })

    // Connect team member to team
    await prisma.team.update({
      where: { id: team.id },
      data: {
        teamMembers: {
          connect: { id: teamMember.id },
        },
      },
    })
  }

  // Update user-team relationships
  const users = await prisma.user.findMany({
    where: {
      iracingCustomerId: {
        not: null,
      },
    },
    select: {
      id: true,
      iracingCustomerId: true,
    },
  })

  const memberCustomerIds = new Set(iracingMembers.map((m) => m.custId))
  const matchingUserIds = users
    .filter(
      (user) => user.iracingCustomerId !== null && memberCustomerIds.has(user.iracingCustomerId)
    )
    .map((user) => ({ id: user.id }))

  // Update team-user connections
  await prisma.team.update({
    where: { id: team.id },
    data: {
      members: {
        set: matchingUserIds,
      },
    },
  })

  revalidatePath('/admin')
  revalidatePath('/roster')

  return { success: true, memberCount: iracingMembers.length }
}

export async function getTeamMembers(teamId: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      teamMembers: {
        include: {
          roles: {
            where: {
              teamId: teamId,
            },
          },
        },
      },
    },
  })

  if (!team) {
    throw new Error('Team not found')
  }

  // Sort members by role and name
  const sortedMembers = team.teamMembers
    .map((member) => ({
      ...member,
      role: member.roles[0], // Get the role for this specific team
    }))
    .sort((a, b) => {
      // Sort by owner first, then admin, then name
      if (a.role?.isOwner !== b.role?.isOwner) return a.role?.isOwner ? -1 : 1
      if (a.role?.isAdmin !== b.role?.isAdmin) return a.role?.isAdmin ? -1 : 1
      return a.displayName.localeCompare(b.displayName)
    })

  // Check which members are enrolled in the app
  const enrolledUsers = await prisma.user.findMany({
    where: {
      iracingCustomerId: {
        in: sortedMembers.map((m) => m.custId),
      },
    },
    select: {
      id: true,
      iracingCustomerId: true,
      name: true,
      email: true,
    },
  })

  // Create a map for quick lookup
  const enrolledMap = new Map(enrolledUsers.map((u) => [u.iracingCustomerId, u]))

  const membersWithEnrollment = sortedMembers.map((member) => {
    const enrolledUser = enrolledMap.get(member.custId)
    return {
      custId: member.custId,
      displayName: member.displayName,
      isOwner: member.role?.isOwner || false,
      isAdmin: member.role?.isAdmin || false,
      isEnrolled: !!enrolledUser,
      userId: enrolledUser?.id,
      appName: enrolledUser?.name,
      appEmail: enrolledUser?.email,
    }
  })

  const enrolledCount = membersWithEnrollment.filter((m) => m.isEnrolled).length

  return {
    teamName: team.alias || team.name,
    iracingTeamId: team.iracingTeamId,
    members: membersWithEnrollment,
    enrolledCount,
    totalCount: team.teamMembers.length,
  }
}

export async function createTeam(iracingTeamId: number) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  logger.debug(
    '[createTeam] Input iracingTeamId: %d, Type: %s',
    iracingTeamId,
    typeof iracingTeamId
  )

  if (!iracingTeamId) {
    throw new Error('iRacing Team ID is required')
  }

  // Check if team already exists
  const existing = await prisma.team.findUnique({
    where: { iracingTeamId },
  })

  if (existing) {
    throw new Error('This iRacing Team ID is already registered')
  }

  // Fetch team info from iRacing API
  logger.info('[createTeam] Fetching team info for ID: %d', iracingTeamId)
  const teamInfo = await fetchTeamInfo(iracingTeamId)
  logger.info('[createTeam] Team info received: %o', teamInfo)

  if (!teamInfo) {
    throw new Error(
      'Could not fetch team information from iRacing. Please verify the Team ID is correct.'
    )
  }

  // Fetch team members to check against our users
  logger.info('[createTeam] Fetching team members for ID: %d', iracingTeamId)
  const teamMembers = await fetchTeamMembers(iracingTeamId)
  logger.info('[createTeam] Team members count: %d', teamMembers.length)

  // Get all users with iRacing customer IDs
  const users = await prisma.user.findMany({
    where: {
      iracingCustomerId: {
        not: null,
      },
    },
    select: {
      id: true,
      iracingCustomerId: true,
    },
  })
  logger.info('[createTeam] Found %d users with iRacing IDs', users.length)

  // Find which users are members of this team
  const memberCustomerIds = new Set(teamMembers.map((m) => m.custId))
  const matchingUserIds = users
    .filter(
      (user) => user.iracingCustomerId !== null && memberCustomerIds.has(user.iracingCustomerId)
    )
    .map((user) => ({ id: user.id }))
  logger.info('[createTeam] Matched %d users to team members', matchingUserIds.length)

  logger.info(
    '[createTeam] Creating team with iracingTeamId: %d, Type: %s',
    teamInfo.teamId,
    typeof teamInfo.teamId
  )

  // Create or connect TeamMembers and their roles
  const teamMemberOperations = []
  const roleOperations = []

  for (const member of teamMembers) {
    // Find or create the TeamMember
    const teamMember = await prisma.teamMember.upsert({
      where: { custId: member.custId },
      create: {
        custId: member.custId,
        displayName: member.displayName,
      },
      update: {
        displayName: member.displayName,
      },
    })

    teamMemberOperations.push({ id: teamMember.id })
    roleOperations.push({
      teamMemberId: teamMember.id,
      isOwner: member.owner || false,
      isAdmin: member.admin || false,
    })
  }

  // Create the team with team members and roles
  const team = await prisma.team.create({
    data: {
      name: teamInfo.teamName,
      iracingTeamId: teamInfo.teamId,
      members: {
        connect: matchingUserIds,
      },
      teamMembers: {
        connect: teamMemberOperations,
      },
      roles: {
        create: roleOperations,
      },
    },
  })

  logger.info(
    '[createTeam] Team created successfully with DB iracingTeamId: %d',
    team.iracingTeamId
  )
  revalidatePath('/admin')
  revalidatePath('/roster')
  return team
}

export async function updateTeam(id: string, iracingTeamId: number, alias?: string | null) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  if (!iracingTeamId) {
    throw new Error('iRacing Team ID is required')
  }

  // Check if another team has this ID
  const existing = await prisma.team.findFirst({
    where: {
      iracingTeamId,
      id: { not: id },
    },
  })

  if (existing) {
    throw new Error('This iRacing Team ID is already used by another team')
  }

  // Fetch team info from iRacing API
  const teamInfo = await fetchTeamInfo(iracingTeamId)

  if (!teamInfo) {
    throw new Error(
      'Could not fetch team information from iRacing. Please verify the Team ID is correct.'
    )
  }

  const team = await prisma.team.update({
    where: { id },
    data: {
      name: teamInfo.teamName,
      iracingTeamId: teamInfo.teamId,
      alias: alias?.trim() ? alias.trim() : null,
    },
  })

  revalidatePath('/admin')
  return team
}

export async function deleteTeam(id: string) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  // Check if team is in use
  const usageCount = await prisma.registration.count({
    where: { teamId: id },
  })

  if (usageCount > 0) {
    throw new Error(
      `Cannot delete team: It is currently assigned to ${usageCount} registration(s).`
    )
  }

  await prisma.team.delete({
    where: { id },
  })

  revalidatePath('/admin')
}

/**
 * Helper function to check for Discord thread conflicts
 */
async function checkDiscordThreadConflicts(
  tx: Prisma.TransactionClient,
  existingRegistrations: Array<{
    registrationId?: string
    manualName?: string
    manualIR?: number
    teamId: string | null
  }>,
  threadMap: Record<string, string> | null
): Promise<Map<string, { id: string; teamId: string | null }>> {
  if (existingRegistrations.length === 0) return new Map()

  const currentRegs = await tx.registration.findMany({
    where: {
      id: {
        in: existingRegistrations
          .map((a) => a.registrationId!)
          .filter((id): id is string => id !== undefined),
      },
    },
    select: {
      id: true,
      teamId: true,
    },
  })

  const currentRegMap = new Map(currentRegs.map((reg) => [reg.id, reg]))

  for (const a of existingRegistrations) {
    const currentReg = currentRegMap.get(a.registrationId!)
    if (
      currentReg?.teamId &&
      currentReg.teamId !== a.teamId &&
      threadMap &&
      threadMap[currentReg.teamId]
    ) {
      throw new Error('Cannot change team assignment: Discord thread already exists for this team')
    }
  }

  return currentRegMap
}

/**
 * Helper function to update existing registrations
 */
async function updateExistingRegistrations(
  tx: Prisma.TransactionClient,
  existingRegistrations: Array<{
    registrationId?: string
    manualName?: string
    manualIR?: number
    teamId: string | null
  }>
): Promise<void> {
  if (existingRegistrations.length === 0) return

  // Group registrations by teamId to optimize updates
  const registrationsByTeam = existingRegistrations.reduce<Record<string, string[]>>(
    (acc, assignment) => {
      const teamId = assignment.teamId
      if (!teamId) return acc

      if (!acc[teamId]) {
        acc[teamId] = []
      }
      if (assignment.registrationId) {
        acc[teamId].push(assignment.registrationId)
      }
      return acc
    },
    {}
  )

  // Perform updateMany for each group of registrations with the same team assignment
  for (const [teamId, registrationIds] of Object.entries(registrationsByTeam)) {
    if (registrationIds.length > 0) {
      await tx.registration.updateMany({
        where: {
          id: {
            in: registrationIds,
          },
        },
        data: {
          teamId: teamId,
        },
      })
    }
  }
}

/**
 * Helper function to process manual driver assignments
 */
async function processManualDrivers(
  tx: Prisma.TransactionClient,
  newManualDrivers: Array<{
    registrationId?: string
    manualName?: string
    manualIR?: number
    teamId: string | null
  }>,
  raceId: string,
  carClassId: string,
  currentRegMap: Map<string, { id: string; teamId: string | null }>
): Promise<void> {
  if (newManualDrivers.length === 0) return

  // Find existing manual drivers
  const existingManualDrivers = await tx.manualDriver.findMany({
    where: {
      name: {
        in: newManualDrivers
          .map((a) => a.manualName!)
          .filter((name): name is string => name !== undefined),
      },
    },
  })

  const existingManualMap = new Map(existingManualDrivers.map((driver) => [driver.name, driver]))

  // Prepare create and update operations
  const createOperations: Prisma.ManualDriverCreateManyInput[] = []
  const updateOperations: Prisma.ManualDriverUpdateArgs[] = []

  for (const a of newManualDrivers) {
    const existingDriver = existingManualMap.get(a.manualName!)

    if (!existingDriver) {
      createOperations.push({
        name: a.manualName!,
        irating: a.manualIR || 1350,
        image: `https://api.dicebear.com/9.x/avataaars/png?seed=${a.manualName}`,
      })
    } else if (a.manualIR !== undefined && existingDriver?.irating !== a.manualIR) {
      updateOperations.push({
        where: { id: existingDriver.id! },
        data: { irating: a.manualIR },
      })
    }
  }

  // Create new manual drivers
  let createdDriverMap: Map<string, { id: string; name: string }> = new Map()
  if (createOperations.length > 0) {
    const createdDrivers = await tx.manualDriver.createMany({
      data: createOperations,
      skipDuplicates: true,
    })

    if (createdDrivers.count > 0) {
      // Query the database to get the actual IDs of created drivers
      // since createMany doesn't return the driver objects
      const createdDriverRecords = await tx.manualDriver.findMany({
        where: {
          name: {
            in: createOperations.map((op) => op.name),
          },
        },
      })

      // Create a map of created drivers using the actual database IDs
      createdDriverMap = new Map(
        createdDriverRecords.map((driver) => [
          driver.name,
          {
            id: driver.id,
            name: driver.name,
            irating: driver.irating,
          },
        ])
      )
    }
  }

  // Update existing manual drivers
  if (updateOperations.length > 0) {
    for (const op of updateOperations) {
      await tx.manualDriver.update(op)
    }
  }

  // Determine target car classes for all teams
  const teamsWithRegistrations = new Set(
    newManualDrivers.filter((a) => a.teamId).map((a) => a.teamId)
  )

  const teamCarClasses = await tx.registration.findMany({
    where: {
      raceId,
      teamId: {
        in: Array.from(teamsWithRegistrations).filter((id): id is string => id !== undefined),
      },
    },
    select: {
      teamId: true,
      carClassId: true,
    },
  })

  const teamCarClassMap = new Map(teamCarClasses.map((reg) => [reg.teamId, reg.carClassId]))

  // Prepare registration creation data
  const registrationCreations: Prisma.RegistrationCreateManyInput[] = []

  // First, collect all driver IDs that need to be checked
  const driverIdsToCheck = newManualDrivers
    .map((a) => {
      const existingDriver = existingManualMap.get(a.manualName!)
      const createdDriver = createdDriverMap.get(a.manualName!)
      return existingDriver?.id || createdDriver?.id
    })
    .filter((id): id is string => id !== undefined)

  // Batch check for existing registrations
  if (driverIdsToCheck.length > 0) {
    // Use existing registration map if provided, otherwise create empty map
    // since new manual drivers won't have existing registrations
    const existingRegMap = new Map(
      Array.from(currentRegMap.entries())
        .filter(([id]) => driverIdsToCheck.includes(id))
        .map((entry) => [entry[0], true])
    )

    // Prepare registrations for new manual drivers
    for (const a of newManualDrivers) {
      const existingDriver = existingManualMap.get(a.manualName!)
      const createdDriver = createdDriverMap.get(a.manualName!)

      const driverId = existingDriver?.id || createdDriver?.id

      if (driverId && !existingRegMap.has(driverId)) {
        // Determine car class from team's existing registrations
        let targetCarClassId = carClassId
        if (a.teamId && teamCarClassMap.has(a.teamId!)) {
          targetCarClassId = teamCarClassMap.get(a.teamId!)!
        }

        registrationCreations.push({
          manualDriverId: driverId,
          teamId: a.teamId,
          raceId,
          carClassId: targetCarClassId,
        })
      }
    }
  }

  // Create registrations for new manual drivers
  if (registrationCreations.length > 0) {
    await tx.registration.createMany({
      data: registrationCreations,
    })
  }
}

export async function batchAssignTeams(
  assignments: {
    registrationId?: string
    manualName?: string
    manualIR?: number
    teamId: string | null
  }[],
  raceId: string,
  carClassId: string
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  // Fetch race to check for Discord threads
  const race = await prisma.race.findUnique({
    where: { id: raceId },
    select: { discordTeamThreads: true },
  })
  const threadMap = race?.discordTeamThreads as Record<string, string> | null

  // Use a transaction for reliability
  await prisma.$transaction(async (tx) => {
    // Separate assignments into existing registrations and new manual drivers
    const existingRegistrations = assignments.filter(
      (a) => a.registrationId && !a.registrationId.startsWith('M-')
    )
    const newManualDrivers = assignments.filter((a) => a.manualName)

    // Check for Discord thread conflicts and get current registration map
    const currentRegMap = await checkDiscordThreadConflicts(
      tx as Prisma.TransactionClient,
      existingRegistrations,
      threadMap
    )

    // Update existing registrations
    await updateExistingRegistrations(tx as Prisma.TransactionClient, existingRegistrations)

    // Process new manual drivers
    await processManualDrivers(
      tx as Prisma.TransactionClient,
      newManualDrivers,
      raceId,
      carClassId,
      currentRegMap
    )

    // Mark teams as assigned so roster change notifications are sent
    await prisma.race.update({
      where: { id: raceId },
      data: { teamsAssigned: true },
    })
  })

  revalidatePath('/events')
  revalidatePath('/events/[id]', 'layout')

  // Send Discord notification
  try {
    const { sendTeamsAssignmentNotification } = await import('@/app/actions')
    await sendTeamsAssignmentNotification(raceId)
  } catch (error) {
    logger.error({ err: error }, 'Failed to send Discord notification after batch assign')
    // Don't throw - the team assignment succeeded, notification failure is non-fatal
  }
}
