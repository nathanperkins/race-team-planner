'use server'

import { fetchSpecialEvents } from '@/lib/iracing'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

import { features } from '@/lib/config'

export async function syncIRacingEvents() {
  try {
    if (!features.iracingSync) {
      return { success: false, error: 'iRacing integration is not enabled' }
    }

    const externalEvents = await fetchSpecialEvents()

    for (const event of externalEvents) {
      if (!event.externalId) continue

      // Default end time to 24 hours after start if not provided
      const start = new Date(event.startTime)
      const end = event.endTime
        ? new Date(event.endTime)
        : new Date(start.getTime() + 24 * 60 * 60 * 1000)

      await prisma.$transaction(async (tx) => {
        const upsertedEvent = await tx.event.upsert({
          where: { externalId: event.externalId },
          update: {
            name: event.name,
            startTime: start,
            endTime: end,
            track: event.track,
            description: event.description,
          },
          create: {
            externalId: event.externalId,
            name: event.name,
            startTime: start,
            endTime: end,
            track: event.track,
            description: event.description,
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

    revalidatePath('/dashboard')
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
