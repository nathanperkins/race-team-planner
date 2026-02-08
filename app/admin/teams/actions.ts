'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { fetchTeamInfo, fetchTeamMembers } from '@/lib/iracing'

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
    teamName: team.name,
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

  console.log('[createTeam] Input iracingTeamId:', iracingTeamId, 'Type:', typeof iracingTeamId)

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
  console.log('[createTeam] Fetching team info for ID:', iracingTeamId)
  const teamInfo = await fetchTeamInfo(iracingTeamId)
  console.log('[createTeam] Team info received:', JSON.stringify(teamInfo, null, 2))

  if (!teamInfo) {
    throw new Error(
      'Could not fetch team information from iRacing. Please verify the Team ID is correct.'
    )
  }

  // Fetch team members to check against our users
  console.log('[createTeam] Fetching team members for ID:', iracingTeamId)
  const teamMembers = await fetchTeamMembers(iracingTeamId)
  console.log('[createTeam] Team members count:', teamMembers.length)

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
  console.log('[createTeam] Found', users.length, 'users with iRacing IDs')

  // Find which users are members of this team
  const memberCustomerIds = new Set(teamMembers.map((m) => m.custId))
  const matchingUserIds = users
    .filter(
      (user) => user.iracingCustomerId !== null && memberCustomerIds.has(user.iracingCustomerId)
    )
    .map((user) => ({ id: user.id }))
  console.log('[createTeam] Matched', matchingUserIds.length, 'users to team members')

  console.log(
    '[createTeam] Creating team with iracingTeamId:',
    teamInfo.teamId,
    'Type:',
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

  console.log('[createTeam] Team created successfully with DB iracingTeamId:', team.iracingTeamId)
  revalidatePath('/admin')
  revalidatePath('/roster')
  return team
}

export async function updateTeam(id: string, iracingTeamId: number) {
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

export async function assignRegistrationToTeam(registrationId: string, teamId: string | null) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  // If assigning to a team, verify car class consistency
  if (teamId) {
    const currentReg = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { carClass: true },
    })

    if (!currentReg) throw new Error('Registration not found')

    // Find if anyone else on this team in this race has a different car class
    const conflictReg = await prisma.registration.findFirst({
      where: {
        raceId: currentReg.raceId,
        teamId: teamId,
        id: { not: registrationId },
        carClassId: { not: currentReg.carClassId },
      },
      include: { carClass: true },
    })

    if (conflictReg) {
      throw new Error(
        `Team Class Conflict: This team is already running the ${conflictReg.carClass.name} class in this race. All team members must use the same car class.`
      )
    }
  }

  const registration = await prisma.registration.update({
    where: { id: registrationId },
    data: { teamId },
    include: {
      race: {
        select: { eventId: true },
      },
    },
  })

  revalidatePath('/events')
  if (registration.race?.eventId) {
    revalidatePath(`/events?eventId=${registration.race.eventId}`)
  }

  return registration
}
export async function batchAssignTeams(
  assignments: {
    registrationId?: string
    manualName?: string
    manualIR?: number
    teamId: string | null
  }[],
  overrides?: { raceId?: string; carClassId?: string }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }

  // Use a transaction for reliability
  await prisma.$transaction(async (tx) => {
    for (const a of assignments) {
      if (a.registrationId && !a.registrationId.startsWith('M-')) {
        // Update existing registration (User or existing manual)
        await tx.registration.update({
          where: { id: a.registrationId },
          data: {
            teamId: a.teamId,
            ...(overrides?.raceId ? { raceId: overrides.raceId } : {}),
            ...(overrides?.carClassId ? { carClassId: overrides.carClassId } : {}),
          },
        })
      } else if (a.manualName && overrides?.raceId && overrides?.carClassId) {
        // Find or create manual driver
        let manualDriver = await tx.manualDriver.findFirst({
          where: { name: a.manualName },
        })

        if (!manualDriver) {
          manualDriver = await tx.manualDriver.create({
            data: {
              name: a.manualName,
              irating: a.manualIR || 1350,
              image: `https://api.dicebear.com/9.x/avataaars/png?seed=${a.manualName}`,
            },
          })
        } else if (a.manualIR !== undefined && manualDriver.irating !== a.manualIR) {
          // Update iR if it changed
          await tx.manualDriver.update({
            where: { id: manualDriver.id },
            data: { irating: a.manualIR },
          })
        }

        // Create new manual registration
        await tx.registration.create({
          data: {
            manualDriverId: manualDriver.id,
            teamId: a.teamId,
            raceId: overrides.raceId,
            carClassId: overrides.carClassId,
          },
        })
      }
    }
  })

  revalidatePath('/events')
  revalidatePath('/events/[id]', 'layout')
}
