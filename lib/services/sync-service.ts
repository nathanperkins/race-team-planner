import {
  fetchSpecialEvents,
  fetchCarClasses,
  fetchDriverStats,
  fetchTeamMembers,
} from '@/lib/iracing'
import prisma from '@/lib/prisma'
import { features } from '@/lib/config'
import { SyncStatus, SyncSource } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@/lib/logger'

const logger = createLogger('sync-service')

/**
 * Orchestrates the synchronization of car classes, special events, and driver stats from iRacing.
 * Can be triggered manually by an admin or automatically via a cron job.
 */
export async function runIRacingSync(source: SyncSource = SyncSource.MANUAL) {
  if (!features.iracingSync) {
    return { success: false as const, error: 'iRacing integration is not enabled' }
  }

  // 1. Initialize Sync Log
  const log = await prisma.syncLog.create({
    data: {
      status: SyncStatus.IN_PROGRESS,
      source,
    },
  })

  try {
    // 2. Fetch Global Data from iRacing API
    const [externalEvents, externalCarClasses] = await Promise.all([
      fetchSpecialEvents(),
      fetchCarClasses(),
    ])
    logger.info(
      `[${source}] Fetched ${externalEvents.length} events and ${externalCarClasses.length} car classes from iRacing.`
    )

    // 3. Sync Car Classes First
    const carClassMap = new Map<number, string>()
    for (const carClass of externalCarClasses) {
      const upserted = await prisma.carClass.upsert({
        where: { externalId: carClass.carClassId },
        update: {
          name: carClass.name,
          shortName: carClass.shortName,
        },
        create: {
          externalId: carClass.carClassId,
          name: carClass.name,
          shortName: carClass.shortName,
        },
      })
      carClassMap.set(carClass.carClassId, upserted.id)
    }
    logger.info(`[${source}] Upserted ${carClassMap.size} car classes.`)

    // 4. Sync Special Events
    for (const event of externalEvents) {
      if (!event.externalId) continue

      // Default end time to 24 hours after start if not provided
      const start = new Date(event.startTime)
      const end = event.endTime
        ? new Date(event.endTime)
        : new Date(start.getTime() + 24 * 60 * 60 * 1000)

      const dbCarClassIds = (event.carClassIds || [])
        .map((id) => carClassMap.get(id))
        .filter((id): id is string => !!id)

      await prisma.$transaction(async (tx) => {
        const upsertedEvent = await tx.event.upsert({
          where: { externalId: event.externalId },
          update: {
            name: event.name,
            startTime: start,
            endTime: end,
            track: event.track,
            trackConfig: event.trackConfig,
            description: event.description,
            licenseGroup: event.licenseGroup,
            tempValue: event.tempValue,
            tempUnits: event.tempUnits,
            relHumidity: event.relHumidity,
            skies: event.skies,
            precipChance: event.precipChance,
            durationMins: event.durationMins,
            carClasses: {
              set: dbCarClassIds.map((id) => ({ id })),
            },
          },
          create: {
            externalId: event.externalId,
            name: event.name,
            startTime: start,
            endTime: end,
            track: event.track,
            trackConfig: event.trackConfig,
            description: event.description,
            licenseGroup: event.licenseGroup,
            tempValue: event.tempValue,
            tempUnits: event.tempUnits,
            relHumidity: event.relHumidity,
            skies: event.skies,
            precipChance: event.precipChance,
            durationMins: event.durationMins,
            carClasses: {
              connect: dbCarClassIds.map((id) => ({ id })),
            },
          },
        })

        for (const r of event.races) {
          await tx.race.upsert({
            where: { externalId: r.externalId },
            update: {
              startTime: new Date(r.startTime),
              endTime: new Date(r.endTime),
              eventId: upsertedEvent.id,
            },
            create: {
              externalId: r.externalId,
              startTime: new Date(r.startTime),
              endTime: new Date(r.endTime),
              eventId: upsertedEvent.id,
            },
          })
        }
      })
    }
    logger.info(`[${source}] Upserted ${externalEvents.length} events.`)

    // 5. Sync Driver Stats for all users with iracingCustomerId
    const usersToSync = await prisma.user.findMany({
      where: {
        iracingCustomerId: { not: null },
      },
      select: { id: true, iracingCustomerId: true },
    })

    logger.info(`[${source}] Syncing stats for ${usersToSync.length} users...`)

    for (const user of usersToSync) {
      try {
        await syncUserStats(user.id)
      } catch (userError) {
        logger.error({ err: userError, userId: user.id, source }, 'Failed to sync stats for user')
        // Continue to next user
      }
    }
    logger.info(`[${source}] Finished syncing stats.`)

    // 5b. Sync iRacing Team Memberships for all registered iRacing teams
    const teamsToSync = await prisma.team.findMany({
      where: {
        iracingTeamId: { gt: 0 },
      },
      select: { id: true, iracingTeamId: true },
    })

    logger.info(`[${source}] Syncing memberships for ${teamsToSync.length} teams...`)

    let syncedTeamsCount = 0
    for (const team of teamsToSync) {
      try {
        const teamSyncResult = await syncSingleTeamMembers(team.id, team.iracingTeamId, usersToSync)
        if (teamSyncResult.synced) {
          syncedTeamsCount += 1
        }
      } catch (teamError) {
        logger.error(
          { err: teamError, teamId: team.id, iracingTeamId: team.iracingTeamId, source },
          'Failed to sync memberships for team'
        )
        // Continue to next team
      }
    }
    logger.info(
      `[${source}] Finished syncing team memberships (${syncedTeamsCount}/${teamsToSync.length}).`
    )

    // 6. Update Log to Success
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: SyncStatus.SUCCESS,
        endTime: new Date(),
        count: externalEvents.length,
      },
    })

    revalidatePath('/events')
    revalidatePath('/roster')
    revalidatePath('/admin')

    return {
      success: true as const,
      eventsCount: externalEvents.length,
      carClassesCount: externalCarClasses.length,
      usersCount: usersToSync.length,
      teamsCount: syncedTeamsCount,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ err: error, source }, 'Failed to sync iRacing data')

    // 7. Update Log to Failure
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: SyncStatus.FAILURE,
        endTime: new Date(),
        error: message,
      },
    })

    return {
      success: false as const,
      error: message,
    }
  }
}

/**
 * Syncs iRacing stats for a specific user.
 */
export async function syncUserStats(userId: string, overrideCustomerId?: number) {
  const customerId =
    overrideCustomerId ||
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { iracingCustomerId: true },
      })
    )?.iracingCustomerId

  if (!customerId) {
    throw new Error('User does not have an iRacing Customer ID set.')
  }

  if (isNaN(customerId)) {
    throw new Error('Invalid iRacing Customer ID.')
  }

  const memberInfo = await fetchDriverStats(customerId)
  if (!memberInfo) {
    throw new Error('Failed to fetch stats from iRacing.')
  }

  // Update iracing name if changed
  await prisma.user.update({
    where: { id: userId },
    data: { iracingName: memberInfo.displayName },
  })

  // Upsert RacerStats
  for (const key in memberInfo.licenses) {
    const lic = memberInfo.licenses[key]

    await prisma.racerStats.upsert({
      where: {
        userId_categoryId: {
          userId: userId,
          categoryId: lic.categoryId,
        },
      },
      update: {
        category: lic.category,
        irating: lic.irating || 0,
        licenseLevel: lic.licenseLevel,
        licenseGroup: lic.groupId,
        safetyRating: lic.safetyRating,
        cpi: lic.cpi,
        ttRating: lic.ttRating,
        mprNumRaces: lic.mprNumRaces,
        color: lic.color,
        groupName: lic.groupName,
      },
      create: {
        userId: userId,
        categoryId: lic.categoryId,
        category: lic.category,
        irating: lic.irating || 0,
        licenseLevel: lic.licenseLevel,
        licenseGroup: lic.groupId,
        safetyRating: lic.safetyRating,
        cpi: lic.cpi,
        ttRating: lic.ttRating,
        mprNumRaces: lic.mprNumRaces,
        color: lic.color,
        groupName: lic.groupName,
      },
    })
  }

  revalidatePath('/roster')
  revalidatePath(`/users/${userId}`)

  return { success: true, count: Object.keys(memberInfo.licenses).length }
}

/**
 * Syncs iRacing team memberships for a single team, updating TeamMember rows,
 * TeamMemberRole records, and enrolled User-to-Team relations atomically.
 */
export async function syncSingleTeamMembers(
  teamId: string,
  iracingTeamId: number,
  preloadedUsers?: Array<{ id: string; iracingCustomerId: number | null }>
): Promise<{ synced: boolean; memberCount: number }> {
  if (!iracingTeamId || iracingTeamId <= 0) {
    logger.warn(
      { teamId, iracingTeamId },
      'Skipping team member sync for non-iRacing placeholder team'
    )
    return { synced: false, memberCount: 0 }
  }

  const iracingMembers = await fetchTeamMembers(iracingTeamId)

  // Every valid iRacing team has at least its owner; fetchTeamMembers returns []
  // on transient network/auth errors, so preserve cached memberships rather than wiping.
  if (iracingMembers.length === 0) {
    logger.warn(
      { teamId, iracingTeamId },
      'Received empty roster from iRacing; preserving cached team memberships'
    )
    return { synced: false, memberCount: 0 }
  }

  const uniqueMembers = Array.from(new Map(iracingMembers.map((m) => [m.custId, m])).values())

  const upsertedMembers = await Promise.all(
    uniqueMembers.map((member) =>
      prisma.teamMember.upsert({
        where: { custId: member.custId },
        create: {
          custId: member.custId,
          displayName: member.displayName,
        },
        update: {
          displayName: member.displayName,
        },
      })
    )
  )

  const users =
    preloadedUsers ??
    (await prisma.user.findMany({
      where: {
        iracingCustomerId: {
          not: null,
        },
      },
      select: {
        id: true,
        iracingCustomerId: true,
      },
    }))

  const memberCustomerIds = new Set(uniqueMembers.map((m) => m.custId))
  const matchingUserIds = users
    .filter(
      (user): user is { id: string; iracingCustomerId: number } =>
        user.iracingCustomerId !== null && memberCustomerIds.has(user.iracingCustomerId)
    )
    .map((user) => ({ id: user.id }))

  const roleByCustId = new Map(
    uniqueMembers.map((m) => [m.custId, { isOwner: m.owner || false, isAdmin: m.admin || false }])
  )

  await prisma.$transaction([
    prisma.teamMemberRole.deleteMany({
      where: { teamId },
    }),
    prisma.teamMemberRole.createMany({
      data: upsertedMembers.map((tm) => {
        const role = roleByCustId.get(tm.custId)
        return {
          teamMemberId: tm.id,
          teamId,
          isOwner: role?.isOwner ?? false,
          isAdmin: role?.isAdmin ?? false,
        }
      }),
    }),
    prisma.team.update({
      where: { id: teamId },
      data: {
        teamMembers: {
          set: upsertedMembers.map((tm) => ({ id: tm.id })),
        },
        members: {
          set: matchingUserIds,
        },
      },
    }),
  ])

  return { synced: true, memberCount: uniqueMembers.length }
}
