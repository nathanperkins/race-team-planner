'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
import { getAutoMaxDriversPerTeam, getRaceDurationMinutes } from '@/lib/utils'
import { Prisma, TeamAssignmentStrategy } from '@prisma/client'
import { createLogger } from '@/lib/logger'
import { postRosterChangeNotifications } from '@/lib/discord'

const logger = createLogger('actions')

const RegistrationSchema = z.object({
  raceId: z.string(),
  carClassId: z.string().min(1, 'Car class is required'),
})

type State = {
  message: string
  errors?: Record<string, string[]>
  timestamp?: number
}

function isRegistrationUserForeignKeyError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code !== 'P2003') return false
  return JSON.stringify(error.meta ?? {}).includes('Registration_userId_fkey')
}

async function getOtherRegisteredDriversForRace(
  raceId: string,
  excludeRegistrationId: string
): Promise<Array<{ name: string; carClassName: string; discordId?: string }>> {
  const registrations =
    (await prisma.registration.findMany({
      where: {
        raceId,
        id: { not: excludeRegistrationId },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        carClass: {
          select: {
            name: true,
            shortName: true,
          },
        },
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
        manualDriver: {
          select: {
            name: true,
            irating: true,
          },
        },
      },
    })) ?? []

  return registrations
    .map((reg) => {
      const name = reg.user?.name || reg.manualDriver?.name || ''
      if (!name) return null
      const carClassName = reg.carClass?.shortName || reg.carClass?.name || ''
      if (!carClassName) return null
      const discordId = reg.user?.accounts?.[0]?.providerAccountId
      return {
        name,
        carClassName,
        ...(discordId ? { discordId } : {}),
      }
    })
    .filter((entry): entry is { name: string; carClassName: string; discordId?: string } => !!entry)
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

/**
 * Ensures an event-level discussion thread exists for the given event.
 * Creates or updates the thread using the unified format from sendTeamsAssignedNotification.
 * Returns the thread ID if successful, or null on failure.
 */
async function upsertEventDiscussionThread(options: {
  eventId: string
  eventName: string
  track?: string | null
  trackConfig?: string | null
  tempValue?: number | null
  precipChance?: number | null
}): Promise<{ threadId: string | null; createdOrReplaced: boolean }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // Find existing thread ID from any race in this event
  const existingEventThread = await prisma.race.findFirst({
    where: {
      eventId: options.eventId,
      NOT: { discordTeamsThreadId: null },
    },
    select: {
      discordTeamsThreadId: true,
    },
  })

  // Fetch all races for this event with their registrations to show all timeslots in the thread
  const allRaces = await prisma.race.findMany({
    where: { eventId: options.eventId },
    select: {
      id: true,
      startTime: true,
      registrations: {
        select: {
          id: true,
          team: { select: { id: true, name: true, alias: true } },
          carClass: { select: { name: true } },
          user: {
            select: {
              name: true,
              accounts: {
                where: { provider: 'discord' },
                select: { providerAccountId: true },
              },
            },
          },
          manualDriver: { select: { name: true } },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  // Fetch car classes for this event
  const event = await prisma.event.findUnique({
    where: { id: options.eventId },
    include: {
      carClasses: { select: { name: true } },
    },
  })

  const carClasses = [
    ...(event?.carClasses.map((cc) => cc.name) ?? []),
    ...(event?.customCarClasses ?? []),
  ]

  // Build timeslots with teams and unassigned drivers
  const timeslots = allRaces.map((race) => {
    const registrations = race.registrations

    // Group registrations by team (null = unassigned)
    const byTeam = new Map<string | null, typeof registrations>()
    for (const reg of registrations) {
      const teamId = reg.team?.id ?? null
      const existing = byTeam.get(teamId) ?? []
      existing.push(reg)
      byTeam.set(teamId, existing)
    }

    // Build teams array (exclude unassigned)
    const teams = Array.from(byTeam.entries())
      .filter(([teamId]) => teamId !== null)
      .map(([, regs]) => {
        const teamName = regs[0].team!.alias || regs[0].team!.name
        return {
          name: teamName,
          members: regs.map((r) => ({
            name: r.user?.name ?? r.manualDriver?.name ?? 'Unknown',
            carClass: r.carClass.name,
            discordId: r.user?.accounts[0]?.providerAccountId,
            registrationId: r.id,
          })),
        }
      })

    // Build unassigned array
    const unassigned = (byTeam.get(null) ?? []).map((r) => ({
      name: r.user?.name ?? r.manualDriver?.name ?? 'Unknown',
      carClass: r.carClass.name,
      discordId: r.user?.accounts[0]?.providerAccountId,
      registrationId: r.id,
    }))

    return {
      raceStartTime: race.startTime,
      teams,
      unassigned: unassigned.length > 0 ? unassigned : undefined,
    }
  })

  const { createOrUpdateEventThread } = await import('@/lib/discord')
  const result = await createOrUpdateEventThread({
    eventName: options.eventName,
    raceUrl: `${baseUrl}/events?eventId=${options.eventId}`,
    track: options.track ?? undefined,
    trackConfig: options.trackConfig ?? undefined,
    tempValue: options.tempValue,
    precipChance: options.precipChance,
    carClasses,
    timeslots,
    threadId: existingEventThread?.discordTeamsThreadId ?? undefined,
  })

  if (result.ok && result.threadId) {
    const previousThreadId = existingEventThread?.discordTeamsThreadId ?? null
    // Only suppress notification if we're REPLACING an existing thread (recovery scenario)
    // If previousThreadId is null, this is a NEW thread (first registration), so send notification
    const createdOrReplaced = previousThreadId !== null && previousThreadId !== result.threadId
    await prisma.race.updateMany({
      where: { eventId: options.eventId },
      data: { discordTeamsThreadId: result.threadId },
    })
    return { threadId: result.threadId, createdOrReplaced }
  }

  logger.error('Failed to create or update event discussion thread')
  return { threadId: null, createdOrReplaced: false }
}

export async function registerForRace(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: 'Unauthorized' }
  }

  // Check race exists and is not completed
  const requestedRaceId = formData.get('raceId') as string
  if (!requestedRaceId) return { message: 'Race ID required' }

  const racePromise = prisma.race.findUnique({
    where: { id: requestedRaceId },
    select: {
      startTime: true,
      endTime: true,
      eventId: true,
      discordTeamsThreadId: true,
      maxDriversPerTeam: true,
      teamsAssigned: true,
      teamAssignmentStrategy: true,
      event: {
        select: {
          id: true,
          name: true,
          track: true,
          trackConfig: true,
          tempValue: true,
          precipChance: true,
        },
      },
    },
  })

  const userPromise = prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      expectationsVersion: true,
      name: true,
      image: true,
      accounts: {
        where: { provider: 'discord' },
        select: { providerAccountId: true },
      },
    },
  })

  const [user, race] = await Promise.all([userPromise, racePromise])

  if (!race) return { message: 'Race not found' }
  if (new Date() > race.endTime) {
    return { message: 'Usage of time machine detected! This race has already finished.' }
  }

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

    const registration = await prisma.registration.create({
      data: {
        userId: session.user.id,
        raceId,
        carClassId,
        teamId,
      },
    })

    // Send Discord notification (non-blocking)
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      // Ensure event-level discussion thread exists as soon as the first driver signs up.
      const discussionThreadId = await upsertEventDiscussionThread({
        eventId: race.eventId,
        eventName: race.event.name,
        track: race.event.track,
        trackConfig: race.event.trackConfig,
        tempValue: race.event.tempValue,
        precipChance: race.event.precipChance,
      }).then((thread) => thread.threadId)

      const { sendRegistrationNotification } = await import('@/lib/discord')

      const discordAccount = user.accounts[0]

      // Only send notification if we have both thread ID and guild ID
      const guildId = process.env.DISCORD_GUILD_ID
      if (discussionThreadId && guildId) {
        const otherRegisteredDrivers = getOtherRegisteredDriversForRace(raceId, registration.id)
        const carClass = prisma.carClass.findUniqueOrThrow({
          where: { id: carClassId },
          select: { name: true },
        })

        const [resolvedDrivers, resolvedCarClass] = await Promise.all([
          otherRegisteredDrivers,
          carClass,
        ])
        await sendRegistrationNotification({
          userName: user.name || 'Unknown User',
          userAvatarUrl: user.image || undefined,
          eventName: race.event.name,
          raceStartTime: race.startTime,
          carClassName: resolvedCarClass.name,
          eventUrl: `${baseUrl}/events?eventId=${race.event.id}`,
          discordUser: discordAccount?.providerAccountId
            ? {
                id: discordAccount.providerAccountId,
                name: user.name || 'Unknown',
              }
            : undefined,
          otherRegisteredDrivers: resolvedDrivers,
          threadId: discussionThreadId,
          guildId,
          track: race.event.track ?? undefined,
          trackConfig: race.event.trackConfig ?? undefined,
        })
      }
    } catch (notificationError) {
      // Log but don't fail the registration if notification fails
      logger.error({ err: notificationError }, 'Failed to send Discord notification')
    }

    revalidatePath(`/events/${race.eventId}`)
    return { message: 'Success' }
  } catch (e) {
    logger.error({ err: e }, 'Registration error')
    if (isRegistrationUserForeignKeyError(e)) {
      return {
        message:
          'Your account could not be found in the database. Please sign out, sign back in, and try again.',
      }
    }
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
        teamId: true,
        team: { select: { id: true, name: true, alias: true } },
        user: { select: { name: true } },
        manualDriver: { select: { name: true } },
        race: {
          select: {
            id: true,
            endTime: true,
            eventId: true,
            discordTeamsThreadId: true,
            discordTeamThreads: true,
          },
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

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const deletePromise = prisma.registration.delete({
      where: {
        id: registrationId,
      },
    })

    // If the dropped race has no Discord thread, look for one from a sibling race in the
    // event. Run in parallel with the delete so there's no extra latency in that case.
    const eventThreadFallbackPromise = registration.race.discordTeamsThreadId
      ? Promise.resolve(null)
      : prisma.race.findFirst({
          where: {
            eventId: registration.race.eventId,
            NOT: { discordTeamsThreadId: null },
          },
          select: { discordTeamsThreadId: true, discordTeamThreads: true },
        })

    const parallelWork = [deletePromise as unknown as Promise<void>]

    // Emit roster-change notifications for user/admin drops without blocking the drop flow.
    try {
      const eventThreadFallback = await eventThreadFallbackPromise
      const eventThreadId =
        registration.race.discordTeamsThreadId ?? eventThreadFallback?.discordTeamsThreadId ?? null
      const teamThreads =
        (registration.race.discordTeamThreads as Record<string, string> | null) ??
        (eventThreadFallback?.discordTeamThreads as Record<string, string> | null) ??
        {}
      if (eventThreadId) {
        const rosterUpdate = prisma.team
          .findMany({
            select: { id: true, name: true, alias: true },
            where: {
              id: { in: Object.keys(teamThreads) },
            },
          })
          .then((teams) => {
            const teamNameById = new Map(teams.map((team) => [team.id, team.alias || team.name]))
            const driverName =
              registration.user?.name || registration.manualDriver?.name || 'Unknown Driver'
            const fromTeam = registration.team?.alias || registration.team?.name || 'Unassigned'

            return postRosterChangeNotifications(
              eventThreadId,
              [{ type: 'dropped', driverName, fromTeam }],
              process.env.DISCORD_BOT_TOKEN || '',
              session.user.name || driverName,
              teamThreads,
              teamNameById
            )
          })
        parallelWork.push(rosterUpdate)

        // Update the main event discussion post and team discussion posts to reflect the drop
        const { createOrUpdateEventThread, refreshAllTeamThreads } = await import('@/lib/discord')
        const races = deletePromise.then(() =>
          prisma.race.findMany({
            where: { eventId: registration.race.eventId },
            select: {
              id: true,
              startTime: true,
              endTime: true,
              eventId: true,
              discordTeamsThreadId: true,
              registrations: {
                select: {
                  id: true,
                  teamId: true,
                  user: {
                    select: {
                      name: true,
                      image: true,
                      accounts: { select: { provider: true, providerAccountId: true } },
                    },
                  },
                  manualDriver: { select: { name: true } },
                  team: {
                    select: {
                      id: true,
                      name: true,
                      alias: true,
                    },
                  },
                  carClass: { select: { name: true } },
                },
              },
              event: {
                select: {
                  id: true,
                  name: true,
                  track: true,
                  trackConfig: true,
                  tempValue: true,
                  precipChance: true,
                  carClasses: { select: { name: true } },
                  customCarClasses: true,
                },
              },
            },
          })
        )

        const updateEventThread = races.then((races) => {
          if (races.length > 0 && races[0].event) {
            const event = races[0].event
            const carClasses = [...event.carClasses.map((cc) => cc.name), ...event.customCarClasses]

            // Build timeslots data for the event discussion post
            const timeslots = buildTimeslotsForEventThread(races)

            // Update the main event discussion post
            return createOrUpdateEventThread({
              eventName: event.name,
              raceUrl: `${baseUrl}/events?eventId=${event.id}`,
              track: event.track ?? undefined,
              trackConfig: event.trackConfig ?? undefined,
              tempValue: event.tempValue,
              precipChance: event.precipChance,
              carClasses,
              timeslots,
              threadId: eventThreadId,
            })
          }
        })

        parallelWork.push(updateEventThread as Promise<void>)

        // Update all team discussion posts
        if (Object.keys(teamThreads).length > 0) {
          // Build races data with teams for refreshAllTeamThreads
          const refreshTeamThreads = races.then((races) =>
            refreshAllTeamThreads(
              racesWithTeams(races),
              teamThreads,
              process.env.DISCORD_BOT_TOKEN || '',
              baseUrl
            )
          )

          parallelWork.push(refreshTeamThreads)
        }
      }
      await Promise.all(parallelWork)
    } catch (notificationError) {
      logger.error({ err: notificationError }, 'Failed to send drop notification')
    }

    if (registration.race?.eventId) {
      revalidatePath(`/events/${registration.race.eventId}`)
    }
    revalidatePath(`/users/${registration.userId}/registrations`)
  } catch (e) {
    logger.error({ err: e }, 'Delete registration error')
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
      include: {
        race: true,
        team: true,
        user: true,
        manualDriver: true,
        carClass: true,
      },
    })

    if (!registration) return { message: 'Registration not found', timestamp: Date.now() }

    const isAdmin = session.user.role === 'ADMIN'
    const isOwner = registration.userId === session.user.id

    if (!isAdmin && !isOwner) {
      return { message: 'Unauthorized', timestamp: Date.now() }
    }

    // Once teams are assigned, non-admin users can still change class while unassigned.
    if (!isAdmin && registration.race.teamsAssigned && registration.teamId) {
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

    await postCarClassChangeNotification(registration, carClassId, session.user.name)

    return { message: 'Success', timestamp: Date.now() }
  } catch (e) {
    logger.error({ err: e }, 'Update registration error')
    return { message: 'Failed to update registration', timestamp: Date.now() }
  }
}

async function postCarClassChangeNotification(
  registration: Prisma.RegistrationGetPayload<{
    include: {
      carClass: true
      team: true
      user: true
      manualDriver: true
      race: true
    }
  }>,
  carClassId: string,
  userName: string | null | undefined
) {
  const oldCarClass = registration.carClass
  // Get the new car class name
  const newCarClass = await prisma.carClass.findUnique({
    where: { id: carClassId },
  })

  // Get team information
  const teamName = registration.team?.alias || registration.team?.name || 'Unassigned'

  // Get driver name
  const driverName = registration.user?.name || registration.manualDriver?.name || 'Unknown Driver'

  if (registration.race.discordTeamsThreadId && oldCarClass?.name && newCarClass?.name) {
    await postRosterChangeNotifications(
      registration.race.discordTeamsThreadId,
      [
        {
          type: 'teamClassChanged',
          teamName,
          fromClass: oldCarClass.name,
          toClass: newCarClass.name,
          drivers: [driverName],
        },
      ],
      process.env.DISCORD_BOT_TOKEN || '',
      userName || driverName
    )
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
    logger.error({ err: e }, 'Update race time error')
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

/**
 * Dedicated data loading functions to avoid duplication across helper functions
 * Each function loads only the specific fields needed by the calling functions
 */

/**
 * Loads team data for use in team operations
 * If raceId is provided, only loads teams that are used in that race
 */
async function loadTeamsData(
  raceId?: string
): Promise<Array<{ id: string; name: string; iracingTeamId: number | null }>> {
  const whereClause = raceId
    ? {
        registrations: {
          some: {
            raceId: raceId,
          },
        },
      }
    : {}

  return await prisma.team.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      iracingTeamId: true,
    },
  })
}

/**
 * Loads users by their IDs
 */
async function loadUsersByIds(userIds: string[]): Promise<Array<{ id: string }>> {
  if (userIds.length === 0) return []
  return await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  })
}

/**
 * Loads manual drivers by their IDs
 */
async function loadManualDriversByIds(manualDriverIds: string[]): Promise<Array<{ id: string }>> {
  if (manualDriverIds.length === 0) return []
  return await prisma.manualDriver.findMany({
    where: { id: { in: manualDriverIds } },
    select: { id: true },
  })
}

/**
 * Loads registrations by their IDs
 */
async function loadRegistrationsByIds(registrationIds: string[]) {
  if (registrationIds.length === 0) return []
  return await prisma.registration.findMany({
    where: { id: { in: registrationIds } },
    select: {
      id: true,
      userId: true,
      raceId: true,
      teamId: true,
    },
  })
}

/**
 * Loads car class IDs for a race
 */
async function loadCarClassIdsForRace(raceId: string) {
  return await prisma.registration.findMany({
    where: { raceId },
    select: { carClassId: true },
    distinct: ['carClassId'],
  })
}

/**
 * Loads registration existence for multiple user-race pairs in batch
 */
async function loadUserRegistrationExistenceBatch(
  raceId: string,
  userIds: string[]
): Promise<Array<string>> {
  if (userIds.length === 0) return []
  const registrations = await prisma.registration.findMany({
    where: {
      raceId,
      userId: { in: userIds },
    },
    select: { id: true, userId: true },
  })
  const resultMap = new Map<string, string>()
  userIds.forEach((userId) => resultMap.set(userId, ''))
  registrations.forEach((reg) => resultMap.set(reg.userId!, reg.id))
  return userIds.map((userId) => {
    const result = resultMap.get(userId)
    return result !== undefined ? result : ''
  })
}

/**
 * Loads registration existence for multiple manual driver-race pairs in batch
 */
async function loadManualDriverRegistrationExistenceBatch(
  raceId: string,
  manualDriverIds: string[]
): Promise<Array<string>> {
  if (manualDriverIds.length === 0) return []
  const registrations = await prisma.registration.findMany({
    where: {
      raceId,
      manualDriverId: { in: manualDriverIds },
    },
    select: { id: true, manualDriverId: true },
  })
  const resultMap = new Map<string, string>()
  manualDriverIds.forEach((manualDriverId) => resultMap.set(manualDriverId, ''))
  registrations.forEach((reg) => resultMap.set(reg.manualDriverId!, reg.id))
  return manualDriverIds.map((manualDriverId) => {
    const result = resultMap.get(manualDriverId)
    return result !== undefined ? result : ''
  })
}

/**
 * Handles team name overrides and new team creation.
 * Renames run after new teams are created so they can reference the new IDs.
 */
async function processTeamEdits(
  isAdmin: boolean,
  newTeams: Array<{ id: string; name: string }>,
  teamNameOverrides: Record<string, string>,
  race: {
    id: string
    discordTeamThreads: Prisma.JsonValue | null
  }
): Promise<Map<string, string>> {
  if (!isAdmin) return new Map()

  const teamOperations: Promise<unknown>[] = []
  const tempTeamMap = new Map<string, string>()

  // Fetch existing teams data once for both rename and new team operations
  let existingTeamsData: Array<{ id: string; name: string; iracingTeamId: number | null }> = []
  if (Object.keys(teamNameOverrides).length > 0 || newTeams.length > 0) {
    existingTeamsData = await loadTeamsData(race.id)
  }

  // Handle team name overrides
  if (Object.keys(teamNameOverrides).length > 0) {
    const existingTeamNames = new Set(existingTeamsData.map((team) => team.name))
    const teamById = new Map(existingTeamsData.map((team) => [team.id, team]))

    const renameUpdates: Array<{ id: string; name: string }> = []

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

    // Check if any teams being renamed have Discord threads
    const threadMap = race.discordTeamThreads as Record<string, string> | null
    if (threadMap) {
      for (const update of renameUpdates) {
        if (threadMap[update.id]) {
          throw new Error(
            'Cannot rename team: Discord thread already exists for this team. Team names are immutable after thread creation to prevent confusion.'
          )
        }
      }
    }

    // Batch team rename updates
    if (renameUpdates.length > 0) {
      teamOperations.push(
        prisma.$transaction(
          renameUpdates.map((update) =>
            prisma.team.update({
              where: { id: update.id },
              data: { name: update.name },
            })
          )
        )
      )
    }
  }

  // Handle new teams
  if (newTeams.length > 0) {
    const existingTeamNames = new Set(existingTeamsData.map((team) => team.name))
    const existingTeamIds = new Set(
      existingTeamsData
        .map((team) => team.iracingTeamId)
        .filter((value): value is number => typeof value === 'number')
    )
    let baseId = -Math.floor(Date.now() / 1000)

    const teamsToCreate = newTeams.map((team) => {
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

      return {
        name,
        iracingTeamId,
        tempId: team.id,
      }
    })

    // Create all teams in a single batch (remove tempId from data)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const teamsData = teamsToCreate.map(({ tempId: _, ...rest }) => rest)
    await prisma.team.createMany({
      data: teamsData,
    })

    // TODO: Avoid this follow-up findMany by pre-generating UUIDs client-side
    // and passing them as `id` fields in the createMany data, which would reduce
    // new team creation from 2 round-trips to 1.
    // Fetch all teams created in this batch to get their IDs
    const createdTeams = await prisma.team.findMany({
      where: {
        iracingTeamId: {
          in: teamsToCreate.map((t) => t.iracingTeamId),
        },
      },
      select: { id: true, iracingTeamId: true },
    })

    // Map tempIds to actual team IDs
    const createdTeamMap = new Map<number, string>(
      createdTeams.map((team) => [team.iracingTeamId, team.id])
    )

    teamsToCreate.forEach((teamData, index) => {
      if (teamData.tempId) {
        const teamId = createdTeamMap.get(teamsData[index].iracingTeamId)
        if (teamId) {
          tempTeamMap.set(teamData.tempId, teamId)
        }
      }
    })
  }

  // Execute team operations in parallel
  if (teamOperations.length > 0) {
    await Promise.all(teamOperations)
  }

  return tempTeamMap
}

/**
 * Processes pending drops, additions, and updates
 * Combines all registration operations into a single transaction for atomicity
 */
async function processRegistrationEdits(
  isAdmin: boolean,
  session: { user: { id: string } },
  raceId: string,
  pendingDrops: string[],
  pendingAdditions: Array<{
    tempId?: string
    userId?: string | null
    manualDriverId?: string | null
    carClassId: string
    teamId: string | null
  }>,
  updates: Array<{ id: string; carClassId: string; teamId: string | null }>,
  tempTeamMap: Map<string, string> = new Map()
): Promise<{ teamsWereAssigned: boolean }> {
  const allRegistrationOperations: Prisma.PrismaPromise<unknown>[] = []
  let teamsWereAssigned = false

  const resolveTeamId = (teamId: string | null | undefined): string | null => {
    if (!teamId) return null
    return tempTeamMap.get(teamId) ?? teamId
  }

  // BATCHED PENDING DROPS - filter by raceId in the query to avoid a findMany round trip
  if (isAdmin && pendingDrops.length > 0) {
    allRegistrationOperations.push(
      prisma.registration.deleteMany({ where: { id: { in: pendingDrops }, raceId } })
    )
  }

  // BATCHED PENDING ADDITIONS
  if (isAdmin && pendingAdditions.length > 0) {
    const userAdditions = pendingAdditions.filter((a) => a.userId)
    const manualDriverAdditions = pendingAdditions.filter((a) => a.manualDriverId)

    const userIds = userAdditions.map((a) => a.userId!)
    const manualDriverIds = manualDriverAdditions.map((a) => a.manualDriverId!)

    // Fetch all required data in a single parallel call
    const [existingUsers, existingManualDrivers, userExistingRegs, manualDriverExistingRegs] =
      await Promise.all([
        loadUsersByIds(userIds),
        loadManualDriversByIds(manualDriverIds),
        loadUserRegistrationExistenceBatch(raceId, userIds),
        loadManualDriverRegistrationExistenceBatch(raceId, manualDriverIds),
      ])

    const existingUserIds = new Set(existingUsers.map((u) => u.id))
    const existingManualDriverIds = new Set(existingManualDrivers.map((d) => d.id))

    // Check for non-existent users/drivers
    for (const addition of pendingAdditions) {
      if (addition.userId && !existingUserIds.has(addition.userId)) {
        throw new Error(
          'One of the selected drivers no longer exists. Please refresh and try again.'
        )
      }
      if (addition.manualDriverId && !existingManualDriverIds.has(addition.manualDriverId)) {
        throw new Error(
          'One of the selected manual drivers no longer exists. Please refresh and try again.'
        )
      }
    }

    // Build maps for O(1) lookup by driver ID
    const userExistingMap = new Map(userIds.map((id, i) => [id, userExistingRegs[i]]))
    const manualDriverExistingMap = new Map(
      manualDriverIds.map((id, i) => [id, manualDriverExistingRegs[i]])
    )

    // Collect all new registrations for a single createMany call
    const newRegistrations: Prisma.RegistrationCreateManyInput[] = []

    for (const addition of userAdditions) {
      const resolvedTeamId = resolveTeamId(addition.teamId)
      if (resolvedTeamId) teamsWereAssigned = true

      const existingId = userExistingMap.get(addition.userId!)
      if (existingId) {
        allRegistrationOperations.push(
          prisma.registration.update({
            where: { id: existingId },
            data: { carClassId: addition.carClassId, teamId: resolvedTeamId },
          })
        )
      } else {
        newRegistrations.push({
          userId: addition.userId,
          raceId,
          carClassId: addition.carClassId,
          teamId: resolvedTeamId,
        })
      }
    }

    for (const addition of manualDriverAdditions) {
      const resolvedTeamId = resolveTeamId(addition.teamId)
      if (resolvedTeamId) teamsWereAssigned = true

      const existingId = manualDriverExistingMap.get(addition.manualDriverId!)
      if (existingId) {
        allRegistrationOperations.push(
          prisma.registration.update({
            where: { id: existingId },
            data: { carClassId: addition.carClassId, teamId: resolvedTeamId },
          })
        )
      } else {
        newRegistrations.push({
          manualDriverId: addition.manualDriverId,
          raceId,
          carClassId: addition.carClassId,
          teamId: resolvedTeamId,
        })
      }
    }

    if (newRegistrations.length > 0) {
      allRegistrationOperations.push(prisma.registration.createMany({ data: newRegistrations }))
    }
  }

  // BATCHED REGISTRATION UPDATES
  if (updates.length > 0) {
    const droppedIdSet = new Set(pendingDrops)
    const regs = await loadRegistrationsByIds(updates.map((u) => u.id))
    const regMap = new Map(regs.map((reg) => [reg.id, reg]))

    for (const update of updates) {
      if (droppedIdSet.has(update.id)) continue
      const reg = regMap.get(update.id)
      if (!reg || reg.raceId !== raceId) continue
      if (!isAdmin && reg.userId !== session.user.id) continue

      const resolvedTeamId = resolveTeamId(update.teamId)
      if (resolvedTeamId) teamsWereAssigned = true

      allRegistrationOperations.push(
        prisma.registration.update({
          where: { id: update.id },
          data: { carClassId: update.carClassId, teamId: resolvedTeamId },
        })
      )
    }
  }

  // Execute all registration operations in a single transaction
  if (allRegistrationOperations.length > 0) {
    await prisma.$transaction(allRegistrationOperations)
  }

  return { teamsWereAssigned }
}

/**
 * Persists race settings and sends a notification when teams have been assigned.
 * Must run after applyTeamRebalancing so the notification reflects the final state.
 */
async function updateRaceSettings(
  raceId: string,
  maxDriversPerTeam: number | null,
  teamAssignmentStrategy: TeamAssignmentStrategy | null,
  teamsWereAssigned: boolean,
  alreadyAssigned: boolean
): Promise<void> {
  const teamsAssigned = alreadyAssigned || teamsWereAssigned
  await prisma.race.update({
    where: { id: raceId },
    data: {
      maxDriversPerTeam,
      teamAssignmentStrategy: teamAssignmentStrategy || undefined,
      teamsAssigned,
    },
  })

  if (teamsAssigned) {
    try {
      await sendTeamsAssignmentNotification(raceId)
    } catch (notificationError) {
      logger.error({ err: notificationError }, 'Failed to send teams assigned notification')
    }
  }
}

/**
 * Applies team rebalancing across all car classes in parallel
 */
async function applyTeamRebalancing(
  raceId: string,
  maxDriversPerTeam: number | null,
  teamAssignmentStrategy: TeamAssignmentStrategy | null,
  raceStartTime: Date,
  raceEndTime: Date
): Promise<void> {
  const resolvedMaxDrivers =
    maxDriversPerTeam ??
    getAutoMaxDriversPerTeam(getRaceDurationMinutes(raceStartTime, raceEndTime))

  if (!resolvedMaxDrivers || resolvedMaxDrivers <= 0) return

  // Single query to get all car class IDs for rebalancing
  const classIds = await loadCarClassIdsForRace(raceId)

  // Execute rebalancing for each class in parallel
  await Promise.all(
    classIds.map(({ carClassId }) =>
      rebalanceTeamsForClass(raceId, carClassId, resolvedMaxDrivers, teamAssignmentStrategy)
    )
  )
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
        id: true,
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

    // Process team edits (name overrides and new teams)
    let tempTeamMap: Map<string, string> = new Map()
    try {
      tempTeamMap = await processTeamEdits(isAdmin, newTeams, teamNameOverrides, race)
    } catch (error) {
      if (error instanceof Error) {
        return { message: error.message }
      }
      return { message: 'Failed to process team edits' }
    }

    // Process registration edits (drops, additions, updates)
    let teamsWereAssigned = false
    try {
      const result = await processRegistrationEdits(
        isAdmin,
        session,
        raceId,
        pendingDrops,
        pendingAdditions,
        updates,
        tempTeamMap
      )
      teamsWereAssigned = result.teamsWereAssigned
    } catch (error) {
      if (error instanceof Error) {
        return { message: error.message }
      }
      return { message: 'Failed to process registration edits' }
    }

    if (isAdmin) {
      // Rebalance first so the notification in updateRaceSettings reflects final team state
      if (rawApplyRebalance === 'true') {
        await applyTeamRebalancing(
          raceId,
          maxDriversPerTeam,
          teamAssignmentStrategy,
          race.startTime,
          race.endTime
        )
      }
      await updateRaceSettings(
        raceId,
        maxDriversPerTeam,
        teamAssignmentStrategy,
        teamsWereAssigned,
        race.teamsAssigned
      )
    }

    revalidatePath('/events')
    revalidatePath(`/events/${race.eventId}`)

    return { message: 'Success' }
  } catch (error) {
    logger.error({ err: error }, 'Save race edits error')
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
      if (isRegistrationUserForeignKeyError(error)) {
        return {
          message: 'One of the selected drivers no longer exists. Please refresh and try again.',
        }
      }
    }
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to save changes'
    return { message }
  }
}

type RegistrationRow = {
  id: string
  teamId: string | null
  carClassId: string
  userId: string | null
  manualDriverId: string | null
  raceId: string
  team: { id: string; name: string; alias: string | null } | null
  carClass: { id: string; name: string; shortName: string | null }
  user: {
    name: string | null
    accounts: Array<{ providerAccountId: string }>
    racerStats: Array<{ categoryId: number; category: string; irating: number }>
  } | null
  manualDriver: { name: string; irating: number | null } | null
}

function getPreferredRating(
  stats: Array<{ categoryId: number; category: string; irating: number }> | null | undefined
) {
  if (!stats || stats.length === 0) return null
  const preferred =
    stats.find((s) => s.categoryId === 5) ||
    stats.find((s) => s.category?.toLowerCase() === 'sports car') ||
    stats[0]
  return preferred?.irating ?? null
}

/** Build teams list and unassigned list from registrations for a single race. */
function buildTeamsFromRegistrations(
  registrations: RegistrationRow[],
  teamThreads: Record<string, string>,
  guildId: string | undefined,
  buildDiscordWebLink: (opts: { guildId: string; threadId: string }) => string
) {
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
    }
  >()
  const unassigned: Array<{
    name: string
    carClass: string
    discordId?: string
    registrationId?: string
    rating: number
  }> = []

  registrations.forEach((reg) => {
    const driverName = reg.user?.name || reg.manualDriver?.name || 'Driver'
    const carClassName = reg.carClass?.shortName || reg.carClass?.name || ''
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
    if (reg.teamId && reg.team) {
      const existing = teamsMap.get(reg.teamId) || {
        name: reg.team.alias || reg.team.name,
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

  const teamsList = Array.from(teamsMap.entries()).map(([teamId, team]) => {
    const total = team.members.reduce((sum, member) => sum + member.rating, 0)
    const avgSof = team.members.length ? Math.round(total / team.members.length) : 0
    const carClassName = team.carClassName || team.members[0]?.carClass
    const threadId = teamThreads[teamId]
    const threadUrl = guildId && threadId ? buildDiscordWebLink({ guildId, threadId }) : undefined
    return { ...team, avgSof, carClassName, threadUrl }
  })
  teamsList.sort((a, b) => a.name.localeCompare(b.name))
  teamsList.forEach((team) => team.members.sort((a, b) => a.name.localeCompare(b.name)))
  unassigned.sort((a, b) => a.name.localeCompare(b.name))

  return { teamsMap, teamsList, unassigned }
}

function racesWithTeams(
  // TODO: extract input/output into shared types to simplify this signature
  races: Array<{
    id: string
    startTime: Date
    registrations: Array<{
      teamId?: string | null
      team?: { id: string; name: string; alias?: string | null } | null
      carClass: { name: string }
      user?: {
        name?: string | null
        image?: string | null
        accounts?: Array<{ provider: string; providerAccountId: string }>
      } | null
      manualDriver?: { name?: string | null } | null
      id: string
    }>
    event: {
      id: string
      name: string
      track?: string | null | undefined
      trackConfig?: string | null | undefined
      tempValue?: number | null | undefined
      precipChance?: number | null | undefined
      carClasses: Array<{ name: string }>
      customCarClasses: string[]
    }
  }>
): Array<{
  id: string
  startTime: Date
  event: {
    id: string
    name: string
    track: string | null
    trackConfig: string | null
    tempValue: number | null
    precipChance: number | null
    carClasses: Array<{ name: string }>
    customCarClasses: string[]
  }
  teams: Array<{
    id: string
    name: string
    alias: string | null
    carClass: { name: string } | null
    registrations: Array<{
      id: string
      user: {
        name: string | null
        image: string | null
        accounts: Array<{ provider: string; providerAccountId: string }>
      } | null
      manualDriver: { name: string } | null
    }>
  }>
}> {
  return races.map((race) => {
    // Group registrations by team — must be declared per-race to avoid accumulation
    const teamMap = new Map<
      string,
      {
        id: string
        name: string
        alias: string | null
        carClass: { name: string } | null
        registrations: Array<{
          id: string
          user: {
            name: string | null
            image: string | null
            accounts: Array<{ provider: string; providerAccountId: string }>
          } | null
          manualDriver: { name: string } | null
        }>
      }
    >()
    race.registrations.forEach((reg) => {
      if (reg.team && reg.teamId) {
        if (!teamMap.has(reg.teamId)) {
          teamMap.set(reg.teamId, {
            id: reg.team.id,
            name: reg.team.name,
            alias: reg.team.alias ?? null,
            carClass: reg.carClass,
            registrations: [],
          })
        }
        teamMap.get(reg.teamId)!.registrations.push({
          id: reg.id,
          user: reg.user
            ? {
                name: reg.user.name ?? null,
                image: reg.user.image ?? null,
                accounts: reg.user.accounts ?? [],
              }
            : null,
          manualDriver: reg.manualDriver ? { name: reg.manualDriver.name ?? 'Unknown' } : null,
        })
      }
    })

    return {
      id: race.id,
      startTime: race.startTime,
      event: {
        ...race.event!,
        track: race.event!.track ?? null,
        trackConfig: race.event!.trackConfig ?? null,
        tempValue: race.event!.tempValue ?? null,
        precipChance: race.event!.precipChance ?? null,
      },
      teams: Array.from(teamMap.values()),
    }
  })
}

/**
 * Builds timeslots data for event discussion post.
 * This function processes race registrations and organizes them by team
 * for display in the event discussion thread.
 */
function buildTimeslotsForEventThread(
  races: Array<{
    id: string
    startTime: Date
    endTime: Date
    registrations: Array<{
      teamId?: string | null
      team?: { name: string; alias?: string | null } | null
      carClass: { name: string }
      user?: {
        name?: string | null
        accounts?: Array<{ provider: string; providerAccountId: string }>
      } | null
      manualDriver?: { name?: string | null } | null
      id: string
    }>
  }>
) {
  return races.map((race) => {
    // Group registrations by team
    const teamMap = new Map<
      string,
      {
        name: string
        carClassName: string
        members: Array<{
          name: string
          carClass: string
          discordId?: string
          registrationId?: string
        }>
      }
    >()
    const unassignedDrivers: Array<{
      name: string
      carClass: string
      discordId?: string
      registrationId?: string
    }> = []

    race.registrations.forEach((reg) => {
      if (reg.teamId && reg.team) {
        if (!teamMap.has(reg.teamId)) {
          teamMap.set(reg.teamId, {
            name: reg.team.alias || reg.team.name,
            carClassName: reg.carClass.name,
            members: [],
          })
        }
        teamMap.get(reg.teamId)!.members.push({
          name: reg.user?.name || reg.manualDriver?.name || 'Unknown',
          carClass: reg.carClass.name,
          discordId:
            reg.user?.accounts?.find((acc) => acc.provider === 'discord')?.providerAccountId ||
            undefined,
          registrationId: reg.id,
        })
      } else {
        // Unassigned driver
        unassignedDrivers.push({
          name: reg.user?.name || reg.manualDriver?.name || 'Unknown',
          carClass: reg.carClass.name,
          discordId:
            reg.user?.accounts?.find((acc) => acc.provider === 'discord')?.providerAccountId ||
            undefined,
          registrationId: reg.id,
        })
      }
    })

    return {
      raceId: race.id,
      raceStartTime: race.startTime,
      raceEndTime: race.endTime,
      teams: Array.from(teamMap.values()),
      unassigned: unassignedDrivers.length > 0 ? unassignedDrivers : undefined,
    }
  })
}

/**
 * Orchestration layer for team assignment notifications.
 * This function handles the "Business Logic":
 * 1. Fetches raw data from Prisma (Registrations, Users, RacerStats).
 * 2. Processes logic like calculating average SOF and mapping team compositions.
 * 3. Identifies which users have changed teams (Snapshots) to determine who to mention.
 * 4. Coordinates calls to lib/discord.ts to perform the actual API actions.
 * 5. Persists the resulting Discord IDs (Thread IDs) and Snapshots back to the database.
 */
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
    // Load all necessary data from database
    const data = await loadRaceAssignmentData(raceId)

    // Execute the notification logic with preloaded data
    return await sendTeamsAssignmentNotificationWithData(data, {
      id: session.user.id,
      name: session.user.name || undefined,
      role: session.user.role,
    })
  } catch (error) {
    logger.error({ err: error }, 'Failed to send teams assigned notification')
    return { message: 'Failed to send notification' }
  }
}

type RaceAssignmentRegistration = {
  id: string
  teamId: string | null
  carClassId: string
  userId: string | null
  manualDriverId: string | null
  team: { id: string; name: string; alias: string | null } | null
  carClass: { id: string; name: string; shortName: string | null }
  user: {
    name: string | null
    accounts: Array<{ providerAccountId: string }>
    racerStats: Array<{ categoryId: number; category: string; irating: number }>
  } | null
  manualDriver: { name: string; irating: number | null } | null
}

type RaceAssignmentData = {
  raceWithEvent: {
    id: string
    startTime: Date
    teamsAssigned: boolean
    discordTeamsThreadId: string | null
    discordTeamsSnapshot: Prisma.JsonValue | null
    discordTeamThreads: Prisma.JsonValue | null
    event: {
      id: string
      name: string
      track: string | null
      trackConfig: string | null
      tempValue: number | null
      precipChance: number | null
      carClasses: Array<{ name: string }>
      customCarClasses: string[]
    }
  }
  registrations: RaceAssignmentRegistration[]
  allTeams: Array<{ id: string; name: string; alias: string | null }>
  existingEventThreadRecord: { discordTeamsThreadId: string | null } | null
  siblingRaces: Array<{
    id: string
    startTime: Date
    discordTeamThreads: Prisma.JsonValue | null
    teamsAssigned: boolean
  }>
  siblingRaceRegistrations: Array<{
    raceId: string
    registrations: RaceAssignmentRegistration[]
  }>
}

/**
 * Loads all necessary data from the database for team assignment notifications
 */
export async function loadRaceAssignmentData(raceId: string): Promise<RaceAssignmentData> {
  const registrationInclude = {
    team: { select: { name: true, alias: true, id: true } },
    carClass: { select: { id: true, name: true, shortName: true } },
    user: {
      select: {
        name: true,
        accounts: {
          where: { provider: 'discord' as const },
          select: { providerAccountId: true },
        },
        racerStats: { select: { categoryId: true, category: true, irating: true } },
      },
    },
    manualDriver: { select: { name: true, irating: true } },
  }

  // Load race with event data
  const raceWithEvent = await prisma.race.findUnique({
    where: { id: raceId },
    select: {
      id: true,
      startTime: true,
      teamsAssigned: true,
      discordTeamsThreadId: true,
      discordTeamsSnapshot: true,
      discordTeamThreads: true,
      event: {
        select: {
          id: true,
          name: true,
          track: true,
          trackConfig: true,
          tempValue: true,
          precipChance: true,
          carClasses: { select: { name: true } },
          customCarClasses: true,
        },
      },
    },
  })

  if (!raceWithEvent?.event) {
    throw new Error('Race not found')
  }

  // Load data in parallel after getting the base race information
  const [currentRegistrations, allTeams, existingEventThreadRecord, siblingRaces] =
    await Promise.all([
      // Load all registrations for the current race, including unassigned drivers
      prisma.registration.findMany({
        where: { raceId },
        include: registrationInclude,
      }),

      // Load only teams that are used in this race for team name mapping
      prisma.team.findMany({
        where: {
          registrations: {
            some: {
              raceId: raceId,
            },
          },
        },
        select: { id: true, name: true, alias: true },
      }),

      // Load existing event thread
      prisma.race.findFirst({
        where: {
          eventId: raceWithEvent.event.id,
          NOT: { discordTeamsThreadId: null },
        },
        select: { discordTeamsThreadId: true },
      }),

      // Load all sibling races so unassigned ones show as empty timeslots in the event thread
      prisma.race.findMany({
        where: {
          eventId: raceWithEvent.event.id,
          id: { not: raceId },
        },
        select: { id: true, startTime: true, discordTeamThreads: true, teamsAssigned: true },
        orderBy: { startTime: 'asc' },
      }),
    ])

  // Load registrations for sibling races that have teams assigned
  const assignedSiblingIds = siblingRaces
    .filter((race) => race.teamsAssigned)
    .map((race) => race.id)
  let siblingRegistrations: RegistrationRow[] = []
  if (assignedSiblingIds.length > 0) {
    siblingRegistrations = await prisma.registration.findMany({
      where: { raceId: { in: assignedSiblingIds } },
      include: registrationInclude,
    })
  }

  const siblingRaceRegistrations = siblingRaces
    .filter((sibling) => sibling.teamsAssigned)
    .map((sibling) => ({
      raceId: sibling.id,
      registrations: siblingRegistrations.filter((r) => r.raceId === sibling.id),
    }))

  return {
    raceWithEvent,
    registrations: currentRegistrations,
    allTeams,
    existingEventThreadRecord,
    siblingRaces,
    siblingRaceRegistrations,
  }
}

/**
 * Sends team assignment notifications with preloaded database data
 */
export async function sendTeamsAssignmentNotificationWithData(
  data: RaceAssignmentData,
  user: { id: string; name?: string; role: string }
): Promise<{ message: string }> {
  const {
    raceWithEvent: race,
    registrations,
    allTeams,
    existingEventThreadRecord,
    siblingRaces,
    siblingRaceRegistrations,
  } = data
  const { event } = race
  const raceId = race.id
  try {
    // Build current snapshot from registrations
    const currentSnapshot: Record<
      string,
      { teamId: string | null; driverName: string; carClassId: string; carClassName: string }
    > = {}
    registrations.forEach((reg) => {
      const driverName = reg.user?.name || reg.manualDriver?.name || 'Driver'
      currentSnapshot[reg.id] = {
        teamId: reg.teamId ?? reg.team?.id ?? null,
        driverName,
        carClassId: reg.carClass.id,
        carClassName: reg.carClass.shortName || reg.carClass.name,
      }
    })

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const raceUrl = `${baseUrl}/events/${event.id}`

    const teamThreads = (race.discordTeamThreads as Record<string, string> | null) ?? {}
    const newlyCreatedOrReplacedTeamThreadIds = new Set<string>()
    const guildId = process.env.DISCORD_GUILD_ID
    const { addUsersToThread, buildDiscordWebLink, createOrUpdateTeamThread } =
      await import('@/lib/discord')

    const existingEventThreadId =
      existingEventThreadRecord?.discordTeamsThreadId ?? race.discordTeamsThreadId
    const mainEventThreadUrl =
      guildId && existingEventThreadId
        ? buildDiscordWebLink({ guildId, threadId: existingEventThreadId })
        : undefined

    const { teamsMap, teamsList, unassigned } = buildTeamsFromRegistrations(
      registrations as RegistrationRow[],
      teamThreads,
      guildId,
      buildDiscordWebLink
    )

    await Promise.all(
      Array.from(teamsMap.entries()).map(async ([teamId, team]) => {
        const memberDiscordIds = team.members
          .map((member) => member.discordId)
          .filter((id): id is string => Boolean(id))

        try {
          const existingThreadId = teamThreads[teamId]
          const threadId = await createOrUpdateTeamThread({
            teamName: team.name,
            eventName: event.name,
            raceStartTime: race.startTime,
            existingThreadId,
            mainEventThreadUrl,
            memberDiscordIds,
            raceUrl,
            track: event.track ?? undefined,
            trackConfig: event.trackConfig ?? undefined,
            tempValue: event.tempValue,
            precipChance: event.precipChance,
            carClassName: team.carClassName,
            members: team.members.map((m) => m.name),
            actorName: user.name || 'Admin',
          })
          if (threadId) {
            if (threadId !== existingThreadId) {
              newlyCreatedOrReplacedTeamThreadIds.add(threadId)
            }
            teamThreads[teamId] = threadId
          }
        } catch (error) {
          logger.error({ err: error }, 'Failed to create team thread')
        }
      })
    )

    await Promise.all(
      Array.from(teamsMap.entries()).map(async ([teamId, team]) => {
        const threadId = teamThreads[teamId]
        if (!threadId) return
        const memberDiscordIds = team.members
          .map((member) => member.discordId)
          .filter((id): id is string => Boolean(id))
        if (memberDiscordIds.length === 0) return
        await addUsersToThread(threadId, memberDiscordIds)
      })
    )

    // Update thread URLs in teamsList after creating threads
    for (const team of teamsList) {
      const teamId = Array.from(teamsMap.entries()).find(([, t]) => t.name === team.name)?.[0]
      if (teamId && teamThreads[teamId] && guildId) {
        team.threadUrl = buildDiscordWebLink({ guildId, threadId: teamThreads[teamId] })
      }
    }

    // Determine mentions: only users whose assignments changed in the current race
    const previousSnapshot =
      (race.discordTeamsSnapshot as
        | Record<
            string,
            {
              teamId: string | null
              driverName: string
              carClassId?: string
              carClassName?: string
            }
          >
        | Record<string, string | null>
        | null) ?? null
    const mentionRegistrationIds = new Set<string>()

    // Build team name mapping - include ALL teams, not just those with current members
    // This ensures we can look up team names for drivers who moved FROM teams
    const teamNameById = new Map(allTeams.map((team) => [team.id, team.alias || team.name]))

    const { buildRosterChangesFromTeamChangeDetails, buildTeamChangeDetails } =
      await import('@/lib/team-change-summary')
    const isLegacyPreviousSnapshot =
      previousSnapshot &&
      Object.values(previousSnapshot).some((v) => typeof v === 'string' || v === null)
    const normalizedPreviousSnapshot: Record<
      string,
      { teamId: string | null; driverName: string; carClassName?: string }
    > | null = previousSnapshot
      ? isLegacyPreviousSnapshot
        ? Object.fromEntries(
            Object.entries(previousSnapshot as Record<string, string | null>).map(
              ([id, teamId]) => [id, { teamId, driverName: 'Driver', carClassName: undefined }]
            )
          )
        : (previousSnapshot as Record<
            string,
            { teamId: string | null; driverName: string; carClassName?: string }
          >)
      : null

    const originalRecords = normalizedPreviousSnapshot
      ? Object.entries(normalizedPreviousSnapshot).map(([id, snapshot]) => ({
          id,
          driverName: snapshot.driverName || currentSnapshot[id]?.driverName || 'Driver',
          teamId: snapshot.teamId,
          teamName: snapshot.teamId ? (teamNameById.get(snapshot.teamId) ?? null) : null,
          carClassName: snapshot.carClassName || currentSnapshot[id]?.carClassName || 'Unknown',
        }))
      : []
    const pendingRecords = Object.entries(currentSnapshot).map(([id, snapshot]) => ({
      id,
      driverName: snapshot.driverName,
      teamId: snapshot.teamId,
      teamName: snapshot.teamId ? (teamNameById.get(snapshot.teamId) ?? null) : null,
      carClassName: snapshot.carClassName,
    }))
    const sharedChangeDetails = buildTeamChangeDetails({
      originalRecords,
      pendingRecords,
      teamNameById,
    })
    const rosterChanges = normalizedPreviousSnapshot
      ? buildRosterChangesFromTeamChangeDetails(sharedChangeDetails)
      : []

    // Event-thread mentions: only newly registered drivers.
    if (normalizedPreviousSnapshot) {
      Object.entries(currentSnapshot).forEach(([regId]) => {
        if (!(regId in normalizedPreviousSnapshot)) {
          mentionRegistrationIds.add(regId)
        }
      })
    }

    // Team-thread mentions: drivers added/moved into a team during this save.
    const registrationDiscordIdById = new Map<string, string>()
    registrations.forEach((reg) => {
      const discordId = reg.user?.accounts?.[0]?.providerAccountId
      if (discordId) {
        registrationDiscordIdById.set(reg.id, discordId)
      }
    })
    const teamMentionDiscordIdsByTeamId = new Map<string, Set<string>>()
    sharedChangeDetails.forEach((detail) => {
      if (!detail.toTeamId) return
      if (detail.type !== 'added' && detail.type !== 'moved') return
      const discordId = registrationDiscordIdById.get(detail.registrationId)
      if (!discordId) return
      const existing = teamMentionDiscordIdsByTeamId.get(detail.toTeamId) ?? new Set<string>()
      existing.add(discordId)
      teamMentionDiscordIdsByTeamId.set(detail.toTeamId, existing)
    })
    const teamMentionDiscordIdsRecord = Object.fromEntries(
      Array.from(teamMentionDiscordIdsByTeamId.entries()).map(([teamId, ids]) => [
        teamId,
        Array.from(ids),
      ])
    )

    // Build timeslots: current race + all other races in the event
    const timeslots: Array<{
      raceStartTime: Date
      teams: typeof teamsList
      unassigned?: typeof unassigned
    }> = []

    // Add current race timeslot
    timeslots.push({
      raceStartTime: race.startTime,
      teams: teamsList,
      unassigned: unassigned.length > 0 ? unassigned : undefined,
    })

    // Add sibling race timeslots
    for (const sibling of siblingRaces) {
      if (sibling.teamsAssigned) {
        const siblingRegs = siblingRaceRegistrations.find(
          (sr) => sr.raceId === sibling.id
        )?.registrations
        if (siblingRegs) {
          const siblingThreads = (sibling.discordTeamThreads as Record<string, string> | null) ?? {}
          const { teamsList: sibTeams, unassigned: sibUnassigned } = buildTeamsFromRegistrations(
            siblingRegs as RegistrationRow[],
            siblingThreads,
            guildId,
            buildDiscordWebLink
          )
          timeslots.push({
            raceStartTime: sibling.startTime,
            teams: sibTeams,
            unassigned: sibUnassigned.length > 0 ? sibUnassigned : undefined,
          })
        }
      } else {
        // Show empty timeslot for races without teams assigned yet
        timeslots.push({
          raceStartTime: sibling.startTime,
          teams: [],
        })
      }
    }

    // Sort timeslots by start time
    timeslots.sort((a, b) => a.raceStartTime.getTime() - b.raceStartTime.getTime())

    // Determine if event thread already exists (meaning this is a 2nd+ timeslot assignment)
    const existingThreadId = existingEventThreadId

    // Combine car classes from relations and custom car classes
    const carClasses = [
      ...event.carClasses.map((carClass) => carClass.name),
      ...event.customCarClasses,
    ]

    const { createOrUpdateEventThread, sendTeamsAssignedNotification } =
      await import('@/lib/discord')

    // 1. Create or update the event thread with team composition
    const threadResult = await createOrUpdateEventThread({
      eventName: event.name,
      raceUrl,
      track: event.track ?? undefined,
      trackConfig: event.trackConfig ?? undefined,
      tempValue: event.tempValue,
      precipChance: event.precipChance,
      carClasses,
      timeslots,
      threadId: existingThreadId,
      mentionRegistrationIds: Array.from(mentionRegistrationIds),
    })

    if (!threadResult.ok) {
      logger.error('Failed to create/update event thread')
      return { message: 'Failed to create event thread' }
    }

    const threadId = threadResult.threadId!

    // 2. Send chat notification
    // - First assignment: Send initial notification
    // - Subsequent updates: Send roster changes notification
    const hasTeamsAssigned = teamsList.length > 0
    const isFirstAssignment = previousSnapshot === null
    const isUpdate = previousSnapshot !== null && race.teamsAssigned
    const rosterChangesForNotification =
      !isFirstAssignment && rosterChanges.length > 0 ? rosterChanges : undefined

    if (hasTeamsAssigned && (isFirstAssignment || isUpdate)) {
      await sendTeamsAssignedNotification(
        threadId,
        {
          eventName: event.name,
          timeslots,
          eventUrl: raceUrl,
          rosterChanges: rosterChangesForNotification,
          adminName: user.name || 'Admin',
          teamThreads,
          teamNameById,
          suppressTeamThreadIds: Array.from(newlyCreatedOrReplacedTeamThreadIds),
          teamMentionDiscordIdsByTeamId: teamMentionDiscordIdsRecord,
        },
        {
          title: isFirstAssignment ? '🏁 Teams Assigned' : '🏁 Teams Updated',
        }
      )
    }

    // 3. Update database with thread info and roster snapshot
    await prisma.race.update({
      where: { id: raceId },
      data: {
        discordTeamsSnapshot: currentSnapshot,
        discordTeamThreads: teamThreads,
      },
    })

    await prisma.race.updateMany({
      where: { eventId: event.id },
      data: { discordTeamsThreadId: threadId },
    })

    return { message: 'Success' }
  } catch (error) {
    logger.error({ err: error }, 'Failed to send teams assigned notification')
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
            accounts: {
              where: { provider: 'discord' },
              select: { providerAccountId: true },
            },
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
        race: {
          select: {
            startTime: true,
            discordTeamsThreadId: true,
            event: {
              select: {
                id: true,
                name: true,
                track: true,
                trackConfig: true,
                tempValue: true,
                precipChance: true,
              },
            },
          },
        },
      },
    })

    // Send Discord notifications (non-blocking)
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      // Ensure event-level discussion thread exists
      const discussionThread = await upsertEventDiscussionThread({
        eventId: race.eventId,
        eventName: registration?.race.event.name || '',
        track: registration?.race.event.track ?? null,
        trackConfig: registration?.race.event.trackConfig ?? null,
        tempValue: registration?.race.event.tempValue ?? null,
        precipChance: registration?.race.event.precipChance ?? null,
      })
      const discussionThreadId = discussionThread.threadId

      // Send registration notification for regular users (not manual drivers)
      // Only send if we have both thread ID and guild ID
      const guildId = process.env.DISCORD_GUILD_ID
      if (registration?.user && discussionThreadId && guildId) {
        const { sendRegistrationNotification } = await import('@/lib/discord')

        const discordAccount = registration.user.accounts[0]
        const otherRegisteredDrivers = await getOtherRegisteredDriversForRace(
          raceId,
          registration.id
        )

        await sendRegistrationNotification({
          userName: registration.user.name || 'Unknown User',
          userAvatarUrl: registration.user.image || undefined,
          eventName: registration.race.event.name,
          raceStartTime: registration.race.startTime,
          carClassName: registration.carClass.name,
          eventUrl: `${baseUrl}/events?eventId=${registration.race.event.id}`,
          discordUser: discordAccount?.providerAccountId
            ? {
                id: discordAccount.providerAccountId,
                name: registration.user.name || 'Unknown',
              }
            : undefined,
          otherRegisteredDrivers,
          threadId: discussionThreadId,
          guildId,
          track: registration.race.event.track ?? undefined,
          trackConfig: registration.race.event.trackConfig ?? undefined,
        })
      }
    } catch (notificationError) {
      // Log but don't fail the registration if notification fails
      logger.error({ err: notificationError }, 'Failed to send Discord notification')
    }

    if (race.teamsAssigned) {
      try {
        await sendTeamsAssignmentNotification(raceId)
      } catch (notificationError) {
        logger.error(
          { err: notificationError },
          'Failed to refresh teams assigned notification after adding driver'
        )
      }
    }

    return { message: 'Success', timestamp: Date.now(), registration }
  } catch (e) {
    logger.error({ err: e }, 'Admin register driver error')
    if (isRegistrationUserForeignKeyError(e)) {
      return {
        message:
          'Selected user no longer exists in the database. Please refresh driver search and try again.',
        timestamp: Date.now(),
      }
    }
    return { message: 'Failed to register driver', timestamp: Date.now() }
  }
}
