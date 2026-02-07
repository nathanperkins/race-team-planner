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
    const resolvedMaxDrivers =
      race.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))
    const teamId = await getAutoTeamId(raceId, carClassId, {
      maxDriversPerTeam: resolvedMaxDrivers,
    })

    await prisma.registration.create({
      data: {
        userId: session.user.id,
        raceId,
        carClassId,
        teamId,
      },
    })

    await rebalanceTeamsForClass(
      raceId,
      carClassId,
      resolvedMaxDrivers,
      race.teamAssignmentStrategy
    )

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

    if (new Date() > registration.race.endTime) {
      return { message: 'Cannot update a completed race', timestamp: Date.now() }
    }

    const resolvedMaxDrivers =
      registration.race.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(
        getRaceDurationMinutes(registration.race.startTime, registration.race.endTime)
      )
    const teamId = await getAutoTeamId(registration.raceId, carClassId, {
      excludeRegistrationId: registrationId,
      maxDriversPerTeam: resolvedMaxDrivers,
    })

    await prisma.registration.update({
      where: { id: registrationId },
      data: { carClassId, teamId },
    })

    await rebalanceTeamsForClass(
      registration.raceId,
      carClassId,
      resolvedMaxDrivers,
      registration.race.teamAssignmentStrategy
    )

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
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized' }
  }

  const raceId = formData.get('raceId') as string
  const rawMaxDrivers = (formData.get('maxDriversPerTeam') as string | null) ?? ''
  const rawStrategy = (formData.get('teamAssignmentStrategy') as string | null) ?? ''
  const rawApplyRebalance = (formData.get('applyRebalance') as string | null) ?? 'false'
  const rawUpdates = (formData.get('registrationUpdates') as string | null) ?? '[]'

  if (!raceId) {
    return { message: 'Race ID required' }
  }

  const race = await prisma.race.findUnique({
    where: { id: raceId },
    select: { startTime: true, endTime: true, eventId: true, maxDriversPerTeam: true },
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

  const isAdmin = session.user.role === 'ADMIN'

  if (isAdmin) {
    await prisma.race.update({
      where: { id: raceId },
      data: { maxDriversPerTeam, teamAssignmentStrategy },
    })
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

      tx.push(
        prisma.registration.update({
          where: { id: update.id },
          data: {
            carClassId: update.carClassId,
            teamId: update.teamId,
          },
        })
      )
    }

    if (tx.length > 0) {
      await prisma.$transaction(tx)
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

  return { success: true }
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
        teamAssignmentStrategy: true,
      },
    })

    if (!race) return { message: 'Race not found', timestamp: Date.now() }
    if (new Date() > race.endTime) {
      return { message: 'Cannot register for a completed race', timestamp: Date.now() }
    }

    const resolvedMaxDrivers =
      race.maxDriversPerTeam ??
      getAutoMaxDriversPerTeam(getRaceDurationMinutes(race.startTime, race.endTime))
    const teamId = await getAutoTeamId(raceId, carClassId, {
      maxDriversPerTeam: resolvedMaxDrivers,
    })

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
      await prisma.registration.create({
        data: {
          userId,
          raceId,
          carClassId,
          teamId,
        },
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
      await prisma.registration.create({
        data: {
          manualDriverId: userId,
          raceId,
          carClassId,
          teamId,
        },
      })
    }

    await rebalanceTeamsForClass(
      raceId,
      carClassId,
      resolvedMaxDrivers,
      race.teamAssignmentStrategy
    )
    revalidatePath(`/events`)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    console.error('Admin register driver error:', e)
    return { message: 'Failed to register driver', timestamp: Date.now() }
  }
}
