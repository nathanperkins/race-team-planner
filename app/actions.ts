'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
import { getAutoMaxDriversPerTeam, getRaceDurationMinutes } from '@/lib/utils'
import { Prisma, TeamAssignmentStrategy } from '@prisma/client'

const RegistrationSchema = z.object({
  raceId: z.string(),
  carClassId: z.string().min(1, 'Car class is required'),
})

type State = {
  message: string
  errors?: Record<string, string[]>
  timestamp?: number
}

async function getAutoTeamId(
  raceId: string,
  carClassId: string,
  options?: {
    excludeRegistrationId?: string
    maxDriversPerTeam?: number | null
  }
): Promise<string | null> {
  const excludeRegistrationId = options?.excludeRegistrationId
  const registrations = await prisma.registration.findMany({
    where: {
      raceId,
      ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { carClassId: true, teamId: true },
  })

  let maxDriversPerTeam = options?.maxDriversPerTeam ?? null
  if (maxDriversPerTeam === undefined || maxDriversPerTeam === null) {
    const race = await prisma.race.findUnique({
      where: { id: raceId },
      select: { maxDriversPerTeam: true, startTime: true, endTime: true },
    })
    if (race) {
      maxDriversPerTeam =
        race.maxDriversPerTeam ??
        getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))
    }
  }

  const usedTeamIds = new Set<string>()
  const teamCounts = new Map<string, number>()

  for (const reg of registrations) {
    if (!reg.teamId) continue
    if (reg.carClassId === carClassId) {
      teamCounts.set(reg.teamId, (teamCounts.get(reg.teamId) || 0) + 1)
    } else {
      usedTeamIds.add(reg.teamId)
    }
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    select: { id: true },
  })

  if (teamCounts.size === 0) {
    const nextTeam = teams.find((team) => !usedTeamIds.has(team.id))
    return nextTeam?.id || null
  }

  const sortedTeams = Array.from(teamCounts.entries()).sort((a, b) => a[1] - b[1])
  const hasCapacity =
    !maxDriversPerTeam || sortedTeams.some(([, count]) => count < maxDriversPerTeam)

  if (hasCapacity) {
    return sortedTeams[0]?.[0] || null
  }

  const nextTeam = teams.find((team) => !usedTeamIds.has(team.id) && !teamCounts.has(team.id))
  if (nextTeam) return nextTeam.id

  return sortedTeams[0]?.[0] || null
}

async function rebalanceTeamsForClass(
  raceId: string,
  carClassId: string,
  maxDriversPerTeam: number | null,
  strategy: TeamAssignmentStrategy | null
) {
  if (!maxDriversPerTeam || maxDriversPerTeam < 1) return

  const registrations = await prisma.registration.findMany({
    where: { raceId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      teamId: true,
      carClassId: true,
      user: {
        select: {
          racerStats: {
            select: {
              categoryId: true,
              category: true,
              irating: true,
            },
          },
        },
      },
    },
  })

  const classRegistrations = registrations.filter((reg) => reg.carClassId === carClassId)
  if (classRegistrations.length === 0) return

  const usedTeamIds = new Set<string>()
  for (const reg of registrations) {
    if (reg.teamId && reg.carClassId !== carClassId) {
      usedTeamIds.add(reg.teamId)
    }
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    select: { id: true },
  })

  const teamIdsForClass = Array.from(
    new Set(classRegistrations.map((reg) => reg.teamId).filter(Boolean) as string[])
  )

  if (teamIdsForClass.length === 0) {
    const firstTeam = teams.find((team) => !usedTeamIds.has(team.id))
    if (!firstTeam) return
    teamIdsForClass.push(firstTeam.id)
  }

  const requiredTeams = Math.ceil(classRegistrations.length / maxDriversPerTeam)
  if (requiredTeams > teamIdsForClass.length) {
    const availableTeamIds = teams
      .map((team) => team.id)
      .filter((id) => !usedTeamIds.has(id) && !teamIdsForClass.includes(id))

    for (const id of availableTeamIds) {
      teamIdsForClass.push(id)
      if (teamIdsForClass.length >= requiredTeams) break
    }
  }

  let orderedTeamIds = teams.map((team) => team.id).filter((id) => teamIdsForClass.includes(id))

  if (requiredTeams < orderedTeamIds.length) {
    orderedTeamIds = orderedTeamIds.slice(0, requiredTeams)
  }

  if (orderedTeamIds.length === 0) return

  const updates: Promise<unknown>[] = []

  if (strategy === TeamAssignmentStrategy.BALANCED_IRATING) {
    const withRatings = classRegistrations.map((reg) => {
      const stats = reg.user?.racerStats || []
      const preferred =
        stats.find((s) => s.categoryId === 5) ||
        stats.find((s) => s.category?.toLowerCase() === 'sports car') ||
        stats[0]
      return {
        ...reg,
        rating: preferred?.irating ?? 0,
      }
    })

    const sortedByRating = withRatings.sort((a, b) => b.rating - a.rating)

    const teamBuckets = orderedTeamIds.map((id) => ({
      id,
      total: 0,
      count: 0,
      regs: [] as typeof sortedByRating,
    }))

    for (const entry of sortedByRating) {
      const candidates = teamBuckets.filter((team) => team.count < maxDriversPerTeam)
      const available = candidates.length > 0 ? candidates : teamBuckets

      let target = available[0]
      for (const team of available) {
        if (team.total < target.total) {
          target = team
        }
      }

      target.total += entry.rating
      target.count += 1
      target.regs.push(entry)
    }

    const computeGap = () => {
      const avgs = teamBuckets.map((team) => (team.count === 0 ? 0 : team.total / team.count))
      return Math.max(...avgs) - Math.min(...avgs)
    }

    let improved = true
    let guard = 0
    while (improved && guard < 50) {
      guard += 1
      improved = false
      let bestSwap: {
        a: number
        b: number
        i: number
        j: number
        delta: number
      } | null = null
      const currentGap = computeGap()

      for (let a = 0; a < teamBuckets.length; a += 1) {
        for (let b = a + 1; b < teamBuckets.length; b += 1) {
          const teamA = teamBuckets[a]
          const teamB = teamBuckets[b]
          for (let i = 0; i < teamA.regs.length; i += 1) {
            for (let j = 0; j < teamB.regs.length; j += 1) {
              const ra = teamA.regs[i].rating
              const rb = teamB.regs[j].rating
              const nextTotalA = teamA.total - ra + rb
              const nextTotalB = teamB.total - rb + ra
              const avgA = teamA.count === 0 ? 0 : nextTotalA / teamA.count
              const avgB = teamB.count === 0 ? 0 : nextTotalB / teamB.count
              const avgs = teamBuckets.map((team, idx) => {
                if (idx === a) return avgA
                if (idx === b) return avgB
                return team.count === 0 ? 0 : team.total / team.count
              })
              const gap = Math.max(...avgs) - Math.min(...avgs)
              const delta = currentGap - gap
              if (delta > 1 && (!bestSwap || delta > bestSwap.delta)) {
                bestSwap = { a, b, i, j, delta }
              }
            }
          }
        }
      }

      if (bestSwap) {
        const teamA = teamBuckets[bestSwap.a]
        const teamB = teamBuckets[bestSwap.b]
        const entryA = teamA.regs[bestSwap.i]
        const entryB = teamB.regs[bestSwap.j]
        if (!entryA || !entryB) {
          break
        }
        teamA.regs[bestSwap.i] = entryB
        teamB.regs[bestSwap.j] = entryA
        teamA.total = teamA.total - entryA.rating + entryB.rating
        teamB.total = teamB.total - entryB.rating + entryA.rating
        improved = true
      }
    }

    for (const team of teamBuckets) {
      for (const entry of team.regs) {
        if (!entry) continue
        if (entry.teamId !== team.id) {
          updates.push(
            prisma.registration.update({
              where: { id: entry.id },
              data: { teamId: team.id },
            })
          )
        }
      }
    }
  } else {
    const baseCount = Math.floor(classRegistrations.length / orderedTeamIds.length)
    let remainder = classRegistrations.length % orderedTeamIds.length
    let regIndex = 0

    for (const teamId of orderedTeamIds) {
      const targetCount = baseCount + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder -= 1

      for (let i = 0; i < targetCount; i += 1) {
        const reg = classRegistrations[regIndex]
        regIndex += 1
        if (reg && reg.teamId !== teamId) {
          updates.push(
            prisma.registration.update({
              where: { id: reg.id },
              data: { teamId },
            })
          )
        }
      }
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }
}

export async function registerForRace(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized' }
  }

  // Check race exists and is not completed
  const requestedRaceId = formData.get('raceId') as string
  if (!requestedRaceId) return { message: 'Race ID required' }

  const race = await prisma.race.findUnique({
    where: { id: requestedRaceId },
    select: {
      startTime: true,
      endTime: true,
      eventId: true,
      maxDriversPerTeam: true,
      teamsAssigned: true,
      teamAssignmentStrategy: true,
    },
  })

  if (!race) return { message: 'Race not found' }
  if (new Date() > race.endTime) {
    return { message: 'Usage of time machine detected! This race has already finished.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { expectationsVersion: true },
  })

  if (!user || (user.expectationsVersion ?? 0) < CURRENT_EXPECTATIONS_VERSION) {
    return { message: 'You must agree to the team expectations before signing up.' }
  }

  const validatedFields = RegistrationSchema.safeParse({
    raceId: formData.get('raceId'),
    carClassId: formData.get('carClassId'),
  })

  if (!validatedFields.success) {
    return { message: 'Invalid fields', errors: validatedFields.error.flatten().fieldErrors }
  }

  const { raceId, carClassId } = validatedFields.data

  try {
    const teamId = null

    const created = await prisma.registration.create({
      data: {
        userId: session.user.id,
        raceId,
        carClassId,
        teamId,
      },
    })

    await prisma.registration.update({
      where: { id: created.id },
      data: { teamId: null },
    })

    // New registrations stay unassigned until admins set teams.

    // Send Discord notification (non-blocking)
    try {
      const registrationData = await prisma.registration.findFirst({
        where: {
          userId: session.user.id,
          raceId,
        },
        include: {
          user: {
            select: {
              name: true,
              image: true,
              accounts: {
                where: { provider: 'discord' },
                select: { providerAccountId: true },
              },
            },
          },
          race: {
            select: {
              startTime: true,
              event: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          carClass: {
            select: {
              name: true,
            },
          },
        },
      })

      if (registrationData && registrationData.user) {
        const { sendRegistrationNotification } = await import('@/lib/discord')
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

        const discordAccount = registrationData.user.accounts[0]

        await sendRegistrationNotification({
          userName: registrationData.user.name || 'Unknown User',
          userAvatarUrl: registrationData.user.image || undefined,
          eventName: registrationData.race.event.name,
          raceStartTime: registrationData.race.startTime,
          carClassName: registrationData.carClass.name,
          eventUrl: `${baseUrl}/events?eventId=${registrationData.race.event.id}`,
          discordUser: discordAccount?.providerAccountId
            ? {
                id: discordAccount.providerAccountId,
                name: registrationData.user.name || 'Unknown',
              }
            : undefined,
        })
      }
    } catch (notificationError) {
      // Log but don't fail the registration if notification fails
      console.error('Failed to send Discord notification:', notificationError)
    }

    revalidatePath(`/events/${race.eventId}`)
    return { message: 'Success' }
  } catch (e) {
    console.error('Registration error:', e)
    return { message: 'Failed to register. You might be already registered for this race.' }
  }
}

export async function deleteRegistration(registrationId: string): Promise<void> {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error('Not authenticated')
  }

  if (!registrationId) {
    throw new Error('Registration ID required')
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: {
        id: registrationId,
      },
      select: {
        id: true,
        userId: true,
        race: {
          select: { endTime: true, eventId: true },
        },
      },
    })

    if (!registration) {
      // Nothing to delete because there is no registration associated with the user.
      return
    }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      throw new Error('Unauthorized to delete this registration')
    }

    if (registration.race && new Date() > registration.race.endTime) {
      throw new Error('Cannot drop from a completed race')
    }

    await prisma.registration.delete({
      where: {
        id: registrationId,
      },
    })

    if (registration.race?.eventId) {
      revalidatePath(`/events/${registration.race.eventId}`)
    }
    revalidatePath(`/users/${registration.userId}/registrations`)
  } catch (e) {
    console.error('Delete registration error:', e)
    throw new Error('Failed to delete registration')
  }

  // Redirecting throws a NEXT_REDIRECT error which appears as a failure to the
  // client component so we rely on revalidatePath to update the UI on the
  // client.
}

export async function updateRegistrationCarClass(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized', timestamp: Date.now() }
  }

  const registrationId = formData.get('registrationId') as string
  const carClassId = formData.get('carClassId') as string

  if (!registrationId) {
    return { message: 'Registration ID required', timestamp: Date.now() }
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { race: true },
    })

    if (!registration) return { message: 'Registration not found', timestamp: Date.now() }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      return { message: 'Unauthorized', timestamp: Date.now() }
    }

    if (!isAdmin && registration.race.teamsAssigned) {
      return { message: 'Teams are already assigned for this race', timestamp: Date.now() }
    }

    if (new Date() > registration.race.endTime) {
      return { message: 'Cannot update a completed race', timestamp: Date.now() }
    }

    const resolvedMaxDrivers =
      registration.race.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(
        getRaceDurationMinutes(registration.race.startTime, registration.race.endTime)
      )
    const preserveUnassigned = !registration.teamId
    const teamId = preserveUnassigned
      ? null
      : await getAutoTeamId(registration.raceId, carClassId, {
          excludeRegistrationId: registrationId,
          maxDriversPerTeam: resolvedMaxDrivers,
        })

    await prisma.registration.update({
      where: { id: registrationId },
      data: { carClassId, teamId },
    })

    if (!preserveUnassigned) {
      await rebalanceTeamsForClass(
        registration.raceId,
        carClassId,
        resolvedMaxDrivers,
        registration.race.teamAssignmentStrategy
      )
    }

    revalidatePath(`/events/${registration.race.eventId}`)
    revalidatePath(`/users/${registration.userId}/registrations`)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    console.error('Update registration error:', e)
    return { message: 'Failed to update registration', timestamp: Date.now() }
  }
}

export async function updateRegistrationRaceTime(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized', timestamp: Date.now() }
  }

  const registrationId = formData.get('registrationId') as string
  const raceId = formData.get('raceId') as string

  if (!registrationId || !raceId) {
    return { message: 'Registration ID and Race ID required', timestamp: Date.now() }
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: { race: true, carClass: true },
    })

    if (!registration) return { message: 'Registration not found', timestamp: Date.now() }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      return { message: 'Unauthorized', timestamp: Date.now() }
    }

    if (!isAdmin && registration.race.teamsAssigned) {
      return { message: 'Teams are already assigned for this race', timestamp: Date.now() }
    }

    if (new Date() > registration.race.endTime) {
      return { message: 'Cannot update a completed race', timestamp: Date.now() }
    }

    const targetRace = await prisma.race.findUnique({
      where: { id: raceId },
      select: {
        startTime: true,
        endTime: true,
        eventId: true,
        maxDriversPerTeam: true,
        teamAssignmentStrategy: true,
      },
    })

    if (!targetRace) {
      return { message: 'Race not found', timestamp: Date.now() }
    }

    if (new Date() > targetRace.endTime) {
      return { message: 'Cannot update a completed race', timestamp: Date.now() }
    }

    const resolvedMaxDrivers =
      targetRace.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(getRaceDurationMinutes(targetRace.startTime, targetRace.endTime))
    const teamId = await getAutoTeamId(raceId, registration.carClassId, {
      excludeRegistrationId: registrationId,
      maxDriversPerTeam: resolvedMaxDrivers,
    })

    await prisma.registration.update({
      where: { id: registrationId },
      data: { raceId, teamId },
    })

    await rebalanceTeamsForClass(
      raceId,
      registration.carClassId,
      resolvedMaxDrivers,
      targetRace.teamAssignmentStrategy
    )

    revalidatePath(`/events/${registration.race.eventId}`)
    revalidatePath(`/events/${targetRace.eventId}`)
    revalidatePath(`/users/${registration.userId}/registrations`)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    console.error('Update race time error:', e)
    // Handle unique constraint error
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return { message: 'You are already registered for that race session.', timestamp: Date.now() }
    }
    return { message: 'Failed to update race session', timestamp: Date.now() }
  }
}

export async function updateRaceTeamSettings(formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized' }
  }

  if (session.user.role !== 'ADMIN') {
    return { message: 'Only admins can update max drivers' }
  }

  const raceId = formData.get('raceId') as string
  const rawValue = (formData.get('maxDriversPerTeam') as string | null) ?? ''
  const rawStrategy = (formData.get('teamAssignmentStrategy') as string | null) ?? ''

  if (!raceId) {
    return { message: 'Race ID required' }
  }

  let maxDriversPerTeam: number | null = null
  const trimmed = rawValue.trim()
  if (trimmed.length > 0) {
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return { message: 'Max drivers must be a positive number' }
    }
    maxDriversPerTeam = Math.floor(parsed)
  }

  const teamAssignmentStrategy =
    rawStrategy === TeamAssignmentStrategy.BALANCED_IRATING
      ? TeamAssignmentStrategy.BALANCED_IRATING
      : TeamAssignmentStrategy.BALANCED_IRATING

  const race = await prisma.race.update({
    where: { id: raceId },
    data: { maxDriversPerTeam, teamAssignmentStrategy },
    select: { eventId: true },
  })

  if (maxDriversPerTeam && maxDriversPerTeam > 0) {
    const classIds = await prisma.registration.findMany({
      where: { raceId },
      select: { carClassId: true },
      distinct: ['carClassId'],
    })

    for (const { carClassId } of classIds) {
      await rebalanceTeamsForClass(raceId, carClassId, maxDriversPerTeam, teamAssignmentStrategy)
    }
  }

  revalidatePath('/events')
  revalidatePath(`/events/${race.eventId}`)

  return { message: 'Success' }
}

export async function saveRaceEdits(formData: FormData) {
  try {
    const session = await auth()
    if (!session || !session.user?.id) {
      return { message: 'Unauthorized' }
    }
    const raceId = formData.get('raceId') as string
    const rawMaxDrivers = (formData.get('maxDriversPerTeam') as string | null) ?? ''
    const rawStrategy = (formData.get('teamAssignmentStrategy') as string | null) ?? ''
    const rawApplyRebalance = (formData.get('applyRebalance') as string | null) ?? 'false'
    const rawUpdates = (formData.get('registrationUpdates') as string | null) ?? '[]'
    const rawNewTeams = (formData.get('newTeams') as string | null) ?? '[]'
    const rawPendingAdditions = (formData.get('pendingAdditions') as string | null) ?? '[]'
    const rawPendingDrops = (formData.get('pendingDrops') as string | null) ?? '[]'
    const rawTeamNameOverrides = (formData.get('teamNameOverrides') as string | null) ?? '{}'

    if (!raceId) {
      return { message: 'Race ID required' }
    }

    const race = await prisma.race.findUnique({
      where: { id: raceId },
      select: {
        startTime: true,
        endTime: true,
        eventId: true,
        maxDriversPerTeam: true,
        teamsAssigned: true,
        discordTeamsThreadId: true,
        discordTeamsSnapshot: true,
        discordTeamThreads: true,
      },
    })

    if (!race) return { message: 'Race not found' }
    if (new Date() > race.endTime) {
      return { message: 'Cannot update a completed race' }
    }

    let maxDriversPerTeam: number | null = null
    const trimmed = rawMaxDrivers.trim()
    if (trimmed.length > 0) {
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed) || parsed < 1) {
        return { message: 'Max drivers must be a positive number' }
      }
      maxDriversPerTeam = Math.floor(parsed)
    }

    const teamAssignmentStrategy =
      rawStrategy === TeamAssignmentStrategy.BALANCED_IRATING
        ? TeamAssignmentStrategy.BALANCED_IRATING
        : TeamAssignmentStrategy.BALANCED_IRATING

    let updates: Array<{ id: string; carClassId: string; teamId: string | null }> = []
    try {
      updates = JSON.parse(rawUpdates) as Array<{
        id: string
        carClassId: string
        teamId: string | null
      }>
    } catch {
      return { message: 'Invalid registration updates' }
    }

    let newTeams: Array<{ id: string; name: string }> = []
    try {
      newTeams = JSON.parse(rawNewTeams) as Array<{ id: string; name: string }>
    } catch {
      return { message: 'Invalid team updates' }
    }

    let teamNameOverrides: Record<string, string> = {}
    try {
      teamNameOverrides = JSON.parse(rawTeamNameOverrides) as Record<string, string>
    } catch {
      return { message: 'Invalid team name overrides' }
    }

    let pendingAdditions: Array<{
      tempId?: string
      userId?: string | null
      manualDriverId?: string | null
      carClassId: string
      teamId: string | null
    }> = []
    try {
      pendingAdditions = JSON.parse(rawPendingAdditions) as Array<{
        tempId?: string
        userId?: string | null
        manualDriverId?: string | null
        carClassId: string
        teamId: string | null
      }>
    } catch {
      return { message: 'Invalid pending additions' }
    }

    let pendingDrops: string[] = []
    try {
      pendingDrops = JSON.parse(rawPendingDrops) as string[]
    } catch {
      return { message: 'Invalid pending drops' }
    }

    const isAdmin = session.user.role === 'ADMIN'

    const tempTeamMap = new Map<string, string>()
    const renameUpdates: Array<{ id: string; name: string }> = []
    if (isAdmin && (newTeams.length > 0 || Object.keys(teamNameOverrides).length > 0)) {
      const existingTeams = await prisma.team.findMany({
        select: { id: true, name: true, iracingTeamId: true },
      })
      const existingTeamNames = new Set(existingTeams.map((team) => team.name))
      const teamById = new Map(existingTeams.map((team) => [team.id, team]))

      for (const [teamId, rawName] of Object.entries(teamNameOverrides)) {
        const current = teamById.get(teamId)
        if (!current) continue
        let name = rawName.trim() || 'Team'
        if (name === current.name) continue
        existingTeamNames.delete(current.name)
        if (existingTeamNames.has(name)) {
          let suffix = 2
          while (existingTeamNames.has(`${name} ${suffix}`)) {
            suffix += 1
          }
          name = `${name} ${suffix}`
        }
        existingTeamNames.add(name)
        renameUpdates.push({ id: teamId, name })
      }
      const existingTeamIds = new Set(
        existingTeams
          .map((team) => team.iracingTeamId)
          .filter((value): value is number => typeof value === 'number')
      )
      let baseId = -Math.floor(Date.now() / 1000)

      for (const team of newTeams) {
        let name = team.name.trim() || 'Team'
        if (existingTeamNames.has(name)) {
          let suffix = 2
          while (existingTeamNames.has(`${name} ${suffix}`)) {
            suffix += 1
          }
          name = `${name} ${suffix}`
        }
        existingTeamNames.add(name)

        while (existingTeamIds.has(baseId)) {
          baseId -= 1
        }
        const iracingTeamId = baseId
        baseId -= 1
        existingTeamIds.add(iracingTeamId)

        const created = await prisma.team.create({
          data: {
            name,
            iracingTeamId,
          },
          select: { id: true },
        })
        tempTeamMap.set(team.id, created.id)
      }
    }

    if (isAdmin && renameUpdates.length > 0) {
      await prisma.$transaction(
        renameUpdates.map((update) =>
          prisma.team.update({
            where: { id: update.id },
            data: { name: update.name },
          })
        )
      )
    }

    if (isAdmin && pendingDrops.length > 0) {
      const regsToDrop = await prisma.registration.findMany({
        where: { id: { in: pendingDrops } },
        select: { id: true, userId: true, raceId: true },
      })
      const tx: Prisma.PrismaPromise<unknown>[] = []
      for (const reg of regsToDrop) {
        if (reg.raceId !== raceId) continue
        tx.push(prisma.registration.delete({ where: { id: reg.id } }))
      }
      if (tx.length > 0) {
        await prisma.$transaction(tx)
      }
    }

    if (isAdmin && pendingAdditions.length > 0) {
      for (const addition of pendingAdditions) {
        if (!addition.carClassId) continue
        const resolvedTeamId = addition.teamId
          ? (tempTeamMap.get(addition.teamId) ?? addition.teamId)
          : null

        if (addition.userId) {
          const existing = await prisma.registration.findUnique({
            where: { userId_raceId: { userId: addition.userId, raceId } },
            select: { id: true },
          })
          if (existing) {
            await prisma.registration.update({
              where: { id: existing.id },
              data: { carClassId: addition.carClassId, teamId: resolvedTeamId },
            })
          } else {
            await prisma.registration.create({
              data: {
                userId: addition.userId,
                raceId,
                carClassId: addition.carClassId,
                teamId: resolvedTeamId,
              },
            })
          }
        } else if (addition.manualDriverId) {
          const existing = await prisma.registration.findUnique({
            where: { manualDriverId_raceId: { manualDriverId: addition.manualDriverId, raceId } },
            select: { id: true },
          })
          if (existing) {
            await prisma.registration.update({
              where: { id: existing.id },
              data: { carClassId: addition.carClassId, teamId: resolvedTeamId },
            })
          } else {
            await prisma.registration.create({
              data: {
                manualDriverId: addition.manualDriverId,
                raceId,
                carClassId: addition.carClassId,
                teamId: resolvedTeamId,
              },
            })
          }
        }
      }
    }

    if (updates.length > 0) {
      const regs = await prisma.registration.findMany({
        where: { id: { in: updates.map((u) => u.id) } },
        select: { id: true, userId: true, raceId: true },
      })
      const regMap = new Map(regs.map((reg) => [reg.id, reg]))

      const tx: Prisma.PrismaPromise<unknown>[] = []
      for (const update of updates) {
        const reg = regMap.get(update.id)
        if (!reg) continue
        if (reg.raceId !== raceId) continue
        if (!isAdmin && reg.userId !== session.user.id) continue

        const resolvedTeamId = update.teamId
          ? (tempTeamMap.get(update.teamId) ?? update.teamId)
          : null

        tx.push(
          prisma.registration.update({
            where: { id: update.id },
            data: {
              carClassId: update.carClassId,
              teamId: resolvedTeamId,
            },
          })
        )
      }

      if (tx.length > 0) {
        await prisma.$transaction(tx)
      }
    }

    let teamsAssignedValue = race.teamsAssigned ?? false
    if (isAdmin) {
      const hasTeams = await prisma.registration.findFirst({
        where: { raceId, teamId: { not: null } },
        select: { id: true },
      })
      teamsAssignedValue = !!hasTeams
      await prisma.race.update({
        where: { id: raceId },
        data: { maxDriversPerTeam, teamAssignmentStrategy, teamsAssigned: teamsAssignedValue },
      })

      if (teamsAssignedValue) {
        try {
          const raceWithEvent = await prisma.race.findUnique({
            where: { id: raceId },
            select: {
              startTime: true,
              event: { select: { id: true, name: true } },
            },
          })
          const registrations = await prisma.registration.findMany({
            where: { raceId },
            include: {
              team: { select: { name: true, id: true } },
              carClass: { select: { name: true, shortName: true } },
              user: {
                select: {
                  name: true,
                  accounts: { where: { provider: 'discord' }, select: { providerAccountId: true } },
                  racerStats: { select: { categoryId: true, category: true, irating: true } },
                },
              },
              manualDriver: { select: { name: true, irating: true } },
            },
          })

          if (raceWithEvent?.event) {
            const teamsMap = new Map<
              string,
              {
                name: string
                members: Array<{
                  name: string
                  carClass: string
                  discordId?: string
                  registrationId?: string
                  rating: number
                }>
                carClassName?: string
                avgSof?: number
              }
            >()
            const unassigned: Array<{
              name: string
              carClass: string
              discordId?: string
              registrationId?: string
              rating: number
            }> = []
            const currentSnapshot: Record<string, string | null> = {}

            const getPreferredRating = (
              stats:
                | Array<{ categoryId: number; category: string; irating: number }>
                | null
                | undefined
            ) => {
              if (!stats || stats.length === 0) return null
              const preferred =
                stats.find((s) => s.categoryId === 5) ||
                stats.find((s) => s.category?.toLowerCase() === 'sports car') ||
                stats[0]
              return preferred?.irating ?? null
            }

            registrations.forEach((reg) => {
              const driverName = reg.user?.name || reg.manualDriver?.name || 'Driver'
              const carClassName = reg.carClass.shortName || reg.carClass.name
              const discordId = reg.user?.accounts?.[0]?.providerAccountId
              const rating =
                getPreferredRating(
                  (
                    reg.user as {
                      racerStats?: Array<{ categoryId: number; category: string; irating: number }>
                    } | null
                  )?.racerStats
                ) ??
                reg.manualDriver?.irating ??
                0
              const teamId = reg.teamId ?? reg.team?.id ?? null
              currentSnapshot[reg.id] = teamId
              if (reg.teamId && reg.team) {
                const existing = teamsMap.get(reg.teamId) || {
                  name: reg.team.name,
                  members: [],
                }
                existing.members.push({
                  name: driverName,
                  carClass: carClassName,
                  discordId,
                  registrationId: reg.id,
                  rating,
                })
                if (!existing.carClassName) {
                  existing.carClassName = carClassName
                }
                teamsMap.set(reg.teamId, existing)
              } else {
                unassigned.push({
                  name: driverName,
                  carClass: carClassName,
                  discordId,
                  registrationId: reg.id,
                  rating,
                })
              }
            })

            const teamThreads = (race.discordTeamThreads as Record<string, string> | null) ?? {}
            const guildId = process.env.DISCORD_GUILD_ID
            const { addUsersToThread, buildTeamThreadLink, createTeamThread } =
              await import('@/lib/discord')

            for (const [teamId, team] of teamsMap.entries()) {
              const memberDiscordIds = team.members
                .map((member) => member.discordId)
                .filter((id): id is string => Boolean(id))
              if (teamThreads[teamId]) continue
              try {
                const threadId = await createTeamThread({
                  teamName: team.name,
                  eventName: raceWithEvent.event.name,
                  raceStartTime: raceWithEvent.startTime,
                  memberDiscordIds,
                })
                if (threadId) {
                  teamThreads[teamId] = threadId
                }
              } catch (error) {
                console.error('Failed to create team thread:', error)
              }
            }

            for (const [teamId, team] of teamsMap.entries()) {
              const threadId = teamThreads[teamId]
              if (!threadId) continue
              const memberDiscordIds = team.members
                .map((member) => member.discordId)
                .filter((id): id is string => Boolean(id))
              if (memberDiscordIds.length === 0) continue
              await addUsersToThread(threadId, memberDiscordIds)
            }

            const teamsList = Array.from(teamsMap.entries()).map(([teamId, team]) => {
              const total = team.members.reduce((sum, member) => sum + member.rating, 0)
              const avgSof = team.members.length ? Math.round(total / team.members.length) : 0
              const carClassName = team.carClassName || team.members[0]?.carClass
              const threadId = teamThreads[teamId]
              const threadUrl =
                guildId && threadId ? buildTeamThreadLink({ guildId, threadId }) : undefined
              return { ...team, avgSof, carClassName, threadUrl }
            })
            teamsList.sort((a, b) => a.name.localeCompare(b.name))
            teamsList.forEach((team) => team.members.sort((a, b) => a.name.localeCompare(b.name)))
            unassigned.sort((a, b) => a.name.localeCompare(b.name))

            const previousSnapshot =
              (race.discordTeamsSnapshot as Record<string, string | null> | null) ?? null
            const mentionRegistrationIds = new Set<string>()
            if (!previousSnapshot) {
              registrations.forEach((reg) => {
                const discordId = reg.user?.accounts?.[0]?.providerAccountId
                if (discordId) {
                  mentionRegistrationIds.add(reg.id)
                }
              })
            } else {
              Object.entries(currentSnapshot).forEach(([regId, teamId]) => {
                if (!(regId in previousSnapshot)) {
                  mentionRegistrationIds.add(regId)
                  return
                }
                if (previousSnapshot[regId] !== teamId) {
                  mentionRegistrationIds.add(regId)
                }
              })
            }

            const { sendTeamsAssignedNotification } = await import('@/lib/discord')
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
            const notification = await sendTeamsAssignedNotification({
              eventName: raceWithEvent.event.name,
              raceStartTime: raceWithEvent.startTime,
              raceUrl: `${baseUrl}/events/${raceWithEvent.event.id}`,
              teams: teamsList,
              unassigned: unassigned.length > 0 ? unassigned : undefined,
              threadId: race.discordTeamsThreadId,
              mentionRegistrationIds: Array.from(mentionRegistrationIds),
            })

            if (notification.ok) {
              await prisma.race.update({
                where: { id: raceId },
                data: {
                  discordTeamsThreadId: notification.threadId ?? race.discordTeamsThreadId ?? null,
                  discordTeamsSnapshot: currentSnapshot,
                  discordTeamThreads: teamThreads,
                },
              })
            } else if (
              notification.threadId &&
              notification.threadId !== race.discordTeamsThreadId
            ) {
              await prisma.race.update({
                where: { id: raceId },
                data: { discordTeamsThreadId: notification.threadId },
              })
            }
          }
        } catch (notificationError) {
          console.error('Failed to send teams assigned notification:', notificationError)
        }
      }
    }

    const resolvedMaxDrivers =
      maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))

    if (isAdmin && rawApplyRebalance === 'true' && resolvedMaxDrivers && resolvedMaxDrivers > 0) {
      const classIds = await prisma.registration.findMany({
        where: { raceId },
        select: { carClassId: true },
        distinct: ['carClassId'],
      })

      for (const { carClassId } of classIds) {
        await rebalanceTeamsForClass(raceId, carClassId, resolvedMaxDrivers, teamAssignmentStrategy)
      }
    }

    revalidatePath('/events')
    revalidatePath(`/events/${race.eventId}`)

    return { message: 'Success' }
  } catch (error) {
    console.error('Save race edits error:', error)
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return { message: 'Database connection failed' }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P1001') {
        return { message: 'Database server is unreachable' }
      }
      if (error.code === 'P1002') {
        return { message: 'Database connection timed out' }
      }
    }
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to save changes'
    return { message }
  }
}

export async function sendTeamsAssignmentNotification(raceId: string) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized' }
  }

  if (session.user.role !== 'ADMIN') {
    return { message: 'Only admins can send notifications' }
  }

  if (!raceId) {
    return { message: 'Race ID required' }
  }

  try {
    const raceWithEvent = await prisma.race.findUnique({
      where: { id: raceId },
      select: {
        startTime: true,
        discordTeamsThreadId: true,
        discordTeamsSnapshot: true,
        discordTeamThreads: true,
        event: { select: { id: true, name: true } },
      },
    })
    if (!raceWithEvent?.event) {
      return { message: 'Race not found' }
    }

    const registrations = await prisma.registration.findMany({
      where: { raceId },
      include: {
        team: { select: { name: true, id: true } },
        carClass: { select: { name: true, shortName: true } },
        user: {
          select: {
            name: true,
            accounts: { where: { provider: 'discord' }, select: { providerAccountId: true } },
            racerStats: { select: { categoryId: true, category: true, irating: true } },
          },
        },
        manualDriver: { select: { name: true, irating: true } },
      },
    })

    const teamsMap = new Map<
      string,
      {
        name: string
        members: Array<{
          name: string
          carClass: string
          discordId?: string
          registrationId?: string
          rating: number
        }>
        carClassName?: string
        avgSof?: number
      }
    >()
    const unassigned: Array<{
      name: string
      carClass: string
      discordId?: string
      registrationId?: string
      rating: number
    }> = []
    const currentSnapshot: Record<string, string | null> = {}

    const getPreferredRating = (
      stats: Array<{ categoryId: number; category: string; irating: number }> | null | undefined
    ) => {
      if (!stats || stats.length === 0) return null
      const preferred =
        stats.find((s) => s.categoryId === 5) ||
        stats.find((s) => s.category?.toLowerCase() === 'sports car') ||
        stats[0]
      return preferred?.irating ?? null
    }

    registrations.forEach((reg) => {
      const driverName = reg.user?.name || reg.manualDriver?.name || 'Driver'
      const carClassName = reg.carClass.shortName || reg.carClass.name
      const discordId = reg.user?.accounts?.[0]?.providerAccountId
      const rating =
        getPreferredRating(
          (
            reg.user as {
              racerStats?: Array<{ categoryId: number; category: string; irating: number }>
            } | null
          )?.racerStats
        ) ??
        reg.manualDriver?.irating ??
        0
      const teamId = reg.teamId ?? reg.team?.id ?? null
      currentSnapshot[reg.id] = teamId
      if (reg.teamId && reg.team) {
        const existing = teamsMap.get(reg.teamId) || {
          name: reg.team.name,
          members: [],
        }
        existing.members.push({
          name: driverName,
          carClass: carClassName,
          discordId,
          registrationId: reg.id,
          rating,
        })
        if (!existing.carClassName) {
          existing.carClassName = carClassName
        }
        teamsMap.set(reg.teamId, existing)
      } else {
        unassigned.push({
          name: driverName,
          carClass: carClassName,
          discordId,
          registrationId: reg.id,
          rating,
        })
      }
    })

    const teamThreads = (raceWithEvent.discordTeamThreads as Record<string, string> | null) ?? {}
    const guildId = process.env.DISCORD_GUILD_ID
    const { addUsersToThread, buildTeamThreadLink, createTeamThread } =
      await import('@/lib/discord')

    for (const [teamId, team] of teamsMap.entries()) {
      const memberDiscordIds = team.members
        .map((member) => member.discordId)
        .filter((id): id is string => Boolean(id))
      if (teamThreads[teamId]) continue
      try {
        const threadId = await createTeamThread({
          teamName: team.name,
          eventName: raceWithEvent.event.name,
          raceStartTime: raceWithEvent.startTime,
          memberDiscordIds,
        })
        if (threadId) {
          teamThreads[teamId] = threadId
        }
      } catch (error) {
        console.error('Failed to create team thread:', error)
      }
    }

    for (const [teamId, team] of teamsMap.entries()) {
      const threadId = teamThreads[teamId]
      if (!threadId) continue
      const memberDiscordIds = team.members
        .map((member) => member.discordId)
        .filter((id): id is string => Boolean(id))
      if (memberDiscordIds.length === 0) continue
      await addUsersToThread(threadId, memberDiscordIds)
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const teamsList = Array.from(teamsMap.entries()).map(([teamId, team]) => {
      const total = team.members.reduce((sum, member) => sum + member.rating, 0)
      const avgSof = team.members.length ? Math.round(total / team.members.length) : 0
      const carClassName = team.carClassName || team.members[0]?.carClass
      const threadId = teamThreads[teamId]
      const threadUrl = guildId && threadId ? buildTeamThreadLink({ guildId, threadId }) : undefined
      return { ...team, avgSof, carClassName, threadUrl }
    })
    teamsList.sort((a, b) => a.name.localeCompare(b.name))
    teamsList.forEach((team) => team.members.sort((a, b) => a.name.localeCompare(b.name)))
    unassigned.sort((a, b) => a.name.localeCompare(b.name))

    const previousSnapshot =
      (raceWithEvent.discordTeamsSnapshot as Record<string, string | null> | null) ?? null
    const mentionRegistrationIds = new Set<string>()
    if (!previousSnapshot) {
      registrations.forEach((reg) => {
        const discordId = reg.user?.accounts?.[0]?.providerAccountId
        if (discordId) {
          mentionRegistrationIds.add(reg.id)
        }
      })
    } else {
      Object.entries(currentSnapshot).forEach(([regId, teamId]) => {
        if (!(regId in previousSnapshot)) {
          mentionRegistrationIds.add(regId)
          return
        }
        if (previousSnapshot[regId] !== teamId) {
          mentionRegistrationIds.add(regId)
        }
      })
    }

    const { sendTeamsAssignedNotification } = await import('@/lib/discord')
    const notification = await sendTeamsAssignedNotification({
      eventName: raceWithEvent.event.name,
      raceStartTime: raceWithEvent.startTime,
      raceUrl: `${baseUrl}/events/${raceWithEvent.event.id}`,
      teams: teamsList,
      unassigned: unassigned.length > 0 ? unassigned : undefined,
      threadId: raceWithEvent.discordTeamsThreadId,
      mentionRegistrationIds: Array.from(mentionRegistrationIds),
    })

    if (notification.ok) {
      await prisma.race.update({
        where: { id: raceId },
        data: {
          discordTeamsThreadId: notification.threadId ?? raceWithEvent.discordTeamsThreadId ?? null,
          discordTeamsSnapshot: currentSnapshot,
          discordTeamThreads: teamThreads,
        },
      })
    } else if (
      notification.threadId &&
      notification.threadId !== raceWithEvent.discordTeamsThreadId
    ) {
      await prisma.race.update({
        where: { id: raceId },
        data: { discordTeamsThreadId: notification.threadId },
      })
    }

    return { message: 'Success' }
  } catch (error) {
    console.error('Failed to send teams assigned notification:', error)
    return { message: 'Failed to send notification' }
  }
}

export async function agreeToExpectations() {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error('Unauthorized')
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { expectationsVersion: CURRENT_EXPECTATIONS_VERSION },
  })

  revalidatePath('/expectations')
  revalidatePath('/profile')
  revalidatePath('/roster')
  revalidatePath('/events/[id]', 'page')

  return {
    success: true,
    data: { expectationsVersion: CURRENT_EXPECTATIONS_VERSION },
  }
}
export async function adminRegisterDriver(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized', timestamp: Date.now() }
  }

  // Admin only
  if (session.user.role !== 'ADMIN') {
    return { message: 'Only admins can use this function', timestamp: Date.now() }
  }

  const raceId = formData.get('raceId') as string
  const userId = formData.get('userId') as string
  const carClassId = formData.get('carClassId') as string

  if (!raceId || !userId || !carClassId) {
    return { message: 'Missing required fields', timestamp: Date.now() }
  }

  try {
    // Check race exists and is not completed
    const race = await prisma.race.findUnique({
      where: { id: raceId },
      select: {
        startTime: true,
        endTime: true,
        eventId: true,
        maxDriversPerTeam: true,
        teamsAssigned: true,
        teamAssignmentStrategy: true,
      },
    })

    if (!race) return { message: 'Race not found', timestamp: Date.now() }
    if (new Date() > race.endTime) {
      return { message: 'Cannot register for a completed race', timestamp: Date.now() }
    }

    const teamId = null

    // Check if it's a regular user or a manual driver
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (user) {
      // Check if already registered
      const existing = await prisma.registration.findUnique({
        where: { userId_raceId: { userId, raceId } },
      })

      if (existing) {
        return { message: 'User already registered for this race', timestamp: Date.now() }
      }

      // Create registration
      const created = await prisma.registration.create({
        data: {
          userId,
          raceId,
          carClassId,
          teamId,
        },
      })
      await prisma.registration.update({
        where: { id: created.id },
        data: { teamId: null },
      })
    } else {
      // Check if it's a manual driver
      const manualDriver = await prisma.manualDriver.findUnique({
        where: { id: userId },
        select: { id: true },
      })

      if (!manualDriver) return { message: 'Driver not found', timestamp: Date.now() }

      // Check if already registered
      const existing = await prisma.registration.findUnique({
        where: { manualDriverId_raceId: { manualDriverId: userId, raceId } },
      })

      if (existing) {
        return { message: 'Driver already registered for this race', timestamp: Date.now() }
      }

      // Create registration
      const created = await prisma.registration.create({
        data: {
          manualDriverId: userId,
          raceId,
          carClassId,
          teamId,
        },
      })
      await prisma.registration.update({
        where: { id: created.id },
        data: { teamId: null },
      })
    }

    // Admin-registered drivers stay unassigned until teams are set.
    revalidatePath(`/events`)

    const registration = await prisma.registration.findFirst({
      where: {
        ...(user ? { userId } : { manualDriverId: userId }),
        raceId,
      },
      include: {
        carClass: true,
        manualDriver: true,
        team: true,
        user: {
          select: {
            name: true,
            image: true,
            racerStats: {
              select: {
                category: true,
                categoryId: true,
                irating: true,
                safetyRating: true,
                groupName: true,
              },
            },
          },
        },
      },
    })

    return { message: 'Success', timestamp: Date.now(), registration }
  } catch (e) {
    console.error('Admin register driver error:', e)
    return { message: 'Failed to register driver', timestamp: Date.now() }
  }
}
