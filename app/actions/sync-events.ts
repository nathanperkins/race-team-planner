'use server'

import { fetchSpecialEvents, fetchCarClasses } from '@/lib/iracing'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { features } from '@/lib/config'

import { auth } from '@/lib/auth'
import { UserRole } from '@prisma/client'

export async function syncIRacingEvents() {
  const session = await auth()
  if (session?.user?.role !== UserRole.ADMIN) {
    return { success: false, error: 'Unauthorized: Admin role required' }
  }

  try {
    if (!features.iracingSync) {
      return { success: false, error: 'iRacing integration is not enabled' }
    }

    const [externalEvents, externalCarClasses] = await Promise.all([
      fetchSpecialEvents(),
      fetchCarClasses(),
    ])

    // 1. Sync Car Classes first
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

    // 2. Sync Events
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

    revalidatePath('/events')
    return { success: true, count: externalEvents.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('SERVER ACTION ERROR: Failed to sync events:', error)
    return {
      success: false,
      error: message,
    }
  }
}
