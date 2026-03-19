'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { createLogger } from '@/lib/logger'
import { validateCustomEventForm } from './customEventSchema'

const logger = createLogger('admin-actions')

interface State {
  message: string
}

export async function createCustomEvent(prevState: State, formData: FormData): Promise<State> {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return { message: 'Unauthorized. Admin access required.' }
    }

    const validation = validateCustomEventForm(formData)
    if (!validation.success) {
      return { message: validation.error }
    }

    const { data, startDates } = validation

    // Sort start dates to find the earliest event start and latest event end
    startDates.sort((a, b) => a.getTime() - b.getTime())
    const earliestStart = startDates[0]

    const duration = data.durationMins ? data.durationMins : 60
    const latestEnd = new Date(startDates[startDates.length - 1].getTime() + duration * 60000)

    // Parse car classes from comma-separated input
    const customCarClasses = data.carClasses
      ? data.carClasses
          .split(',')
          .map((cc) => cc.trim())
          .filter((cc) => cc.length > 0)
      : []

    // Create or find car class records for custom classes
    const carClassConnections: { id: string }[] = []

    // Use a transaction to handle car class creation atomically
    await prisma.$transaction(async (tx) => {
      for (const className of customCarClasses) {
        // Try to find existing car class with this shortName
        let carClass = await tx.carClass.findFirst({
          where: { shortName: className },
        })

        // If not found, create a new one
        if (!carClass) {
          try {
            // Find the next available negative externalId for custom classes
            const lastCustomClass = await tx.carClass.findFirst({
              where: { externalId: { lt: 0 } },
              orderBy: { externalId: 'asc' },
            })
            const nextExternalId = lastCustomClass ? lastCustomClass.externalId - 1 : -1

            carClass = await tx.carClass.create({
              data: {
                name: className,
                shortName: className,
                externalId: nextExternalId,
              },
            })
          } catch (error: unknown) {
            // If there's a unique constraint error, try to find the class again
            const dbError = error as { code?: string }
            if (dbError.code === 'P2002') {
              carClass = await tx.carClass.findFirst({
                where: { shortName: className },
              })
              if (!carClass) throw error
            } else {
              throw error
            }
          }
        }
        if (carClass) {
          carClassConnections.push({ id: carClass.id })
        }
      }
    })

    // Create the event with a single race and custom car classes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventData: any = {
      ...data,
      id: undefined, // Let DB generate ID for new events
      carClasses: undefined, // Handled separately via connect
      startTimes: undefined, // Handled separately under races
      startTime: earliestStart,
      endTime: latestEnd,
      races: {
        create: startDates.map((sd) => ({
          startTime: sd,
          endTime: new Date(sd.getTime() + duration * 60000),
        })),
      },
    }

    // Only add carClasses connection if there are classes to connect
    if (carClassConnections.length > 0) {
      eventData.carClasses = {
        connect: carClassConnections,
      }
    }

    await prisma.event.create({ data: eventData })

    revalidatePath('/events')
    revalidatePath('/admin')

    return { message: 'Success' }
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error creating custom event')
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to create event. Please try again.'
    return { message: `Error: ${errorMessage}` }
  }
}

export async function updateCustomEvent(prevState: State, formData: FormData): Promise<State> {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return { message: 'Unauthorized. Admin access required.' }
    }

    const eventId = formData.get('eventId') as string
    if (!eventId) return { message: 'Event ID is required.' }

    const validation = validateCustomEventForm(formData)
    if (!validation.success) {
      return { message: validation.error }
    }

    const { data, startDates } = validation

    // Sort start dates to find the earliest event start and latest event end
    const sortedStartDates = [...startDates].sort((a, b) => a.getTime() - b.getTime())
    const earliestStart = sortedStartDates[0]

    // Verify event is editable (not synced)
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
      select: { externalId: true },
    })

    if (!existingEvent) return { message: 'Event not found.' }
    if (existingEvent.externalId) {
      return { message: 'Cannot edit synced events. These are managed automatically.' }
    }

    // Calculate end time based on duration (default to 1 hour if not provided)
    const duration = data.durationMins ? data.durationMins : 60
    const latestEnd = new Date(
      sortedStartDates[sortedStartDates.length - 1].getTime() + duration * 60000
    )

    // Parse car classes from comma-separated input
    const customCarClasses = data.carClasses
      ? data.carClasses
          .split(',')
          .map((cc) => cc.trim())
          .filter((cc) => cc.length > 0)
      : []

    // Create or find car class records for custom classes
    const carClassConnections: { id: string }[] = []

    // Handle car classes before the main update
    for (const className of customCarClasses) {
      // Try to find existing car class with this shortName
      let carClass = await prisma.carClass.findFirst({
        where: { shortName: className },
      })

      // If not found, create a new one
      if (!carClass) {
        try {
          // Find the next available negative externalId for custom classes
          const lastCustomClass = await prisma.carClass.findFirst({
            where: { externalId: { lt: 0 } },
            orderBy: { externalId: 'asc' },
          })
          const nextExternalId = lastCustomClass ? lastCustomClass.externalId - 1 : -1

          carClass = await prisma.carClass.create({
            data: {
              name: className,
              shortName: className,
              externalId: nextExternalId,
            },
          })
        } catch (error: unknown) {
          // If there's a unique constraint error, try to find the class again
          const dbError = error as { code?: string }
          if (dbError.code === 'P2002') {
            carClass = await prisma.carClass.findFirst({
              where: { shortName: className },
            })
            if (!carClass) throw error
          } else {
            throw error
          }
        }
      }
      if (carClass) {
        carClassConnections.push({ id: carClass.id })
      }
    }

    // Update the event
    // Note: We are currently NOT updating the child races automatically to match tricky logic.
    // If the event time changes, the Races might need adjustment.
    // For MVP custom events (which usually have 1 race), we can update the races that match the OLD start/end or just all races for this event?
    // Let's safe-update: update the event properties.
    // If it's a simple custom event, we probably want to update the single race wrapper too.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {
        ...data,
        id: undefined, // Don't try to update the ID
        carClasses: undefined,
        startTimes: undefined,
        raceIds: undefined,
        startTime: earliestStart,
        endTime: latestEnd,
      }

      // Only update carClasses if there are classes to set
      if (carClassConnections.length > 0) {
        updateData.carClasses = {
          set: carClassConnections,
        }
      } else {
        // If no car classes, disconnect all
        updateData.carClasses = {
          set: [],
        }
      }

      await tx.event.update({
        where: { id: eventId },
        data: updateData,
      })

      // Handle races
      const existingRaces = await tx.race.findMany({ where: { eventId } })
      const existingRaceIds = existingRaces.map((r: { id: string }) => r.id)

      const newRaceIdsToKeep: string[] = []

      for (let i = 0; i < startDates.length; i++) {
        const sd = startDates[i]
        const rId = data.raceIds ? data.raceIds[i] : undefined
        const raceEnd = new Date(sd.getTime() + duration * 60000)

        if (rId && existingRaceIds.includes(rId)) {
          // Update existing race
          await tx.race.update({
            where: { id: rId },
            data: { startTime: sd, endTime: raceEnd },
          })
          newRaceIdsToKeep.push(rId)
        } else {
          // Create new race
          const newR = await tx.race.create({
            data: {
              eventId,
              startTime: sd,
              endTime: raceEnd,
            },
          })
          newRaceIdsToKeep.push(newR.id)
        }
      }

      // Delete races that were removed
      const racesToDelete = existingRaceIds.filter((id: string) => !newRaceIdsToKeep.includes(id))
      if (racesToDelete.length > 0) {
        await tx.race.deleteMany({
          where: { id: { in: racesToDelete } },
        })
      }
    })

    revalidatePath('/events')
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/admin')

    return { message: 'Success' }
  } catch (error: unknown) {
    logger.error({ err: error }, 'Error updating custom event')
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update event. Please try again.'
    return { message: `Error: ${errorMessage}` }
  }
}

export async function deleteCustomEvent(
  eventId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized. Admin access required.' }
    }

    // Verify event is editable (not synced)
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
      select: { externalId: true },
    })

    if (!existingEvent) return { success: false, message: 'Event not found.' }
    if (existingEvent.externalId) {
      return {
        success: false,
        message: 'Cannot delete synced events. These are managed automatically.',
      }
    }

    // Delete the event (cascade will delete races and registrations)
    await prisma.event.delete({
      where: { id: eventId },
    })

    revalidatePath('/events')
    revalidatePath('/admin')

    return { success: true, message: 'Event deleted successfully.' }
  } catch (error) {
    logger.error({ err: error }, 'Error deleting custom event')
    return { success: false, message: 'Failed to delete event. Please try again.' }
  }
}

export async function triggerWeeklyReportAction() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized' }
    }

    const startWindow = new Date()
    const endWindow = new Date()
    endWindow.setDate(endWindow.getDate() + 7)

    const events = await prisma.event.findMany({
      where: {
        startTime: {
          gte: startWindow,
          lt: endWindow,
        },
      },
      include: {
        races: {
          include: {
            registrations: {
              include: {
                user: {
                  select: {
                    name: true,
                    accounts: {
                      where: { provider: 'discord' },
                      select: { providerAccountId: true },
                    },
                  },
                },
                carClass: { select: { name: true } },
                manualDriver: { select: { name: true, image: true } },
              },
            },
          },
        },
        carClasses: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    })

    if (events.length === 0) {
      return { success: true, message: 'No events found for the upcoming 7 days.', count: 0 }
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const formattedEvents = events.map((event) => {
      const registeredClasses = new Set<string>()
      const registeredUserMap = new Map<string, { name: string; discordId?: string }>()
      const raceTimes: Date[] = []

      event.races.forEach((race) => {
        raceTimes.push(race.startTime)
        race.registrations.forEach((reg) => {
          registeredClasses.add(reg.carClass.name)
          if (reg.user?.name) {
            const discordId = reg.user.accounts[0]?.providerAccountId
            registeredUserMap.set(reg.user.name, { name: reg.user.name, discordId })
          } else if (reg.manualDriver?.name) {
            registeredUserMap.set(reg.manualDriver.name, { name: reg.manualDriver.name })
          }
        })
      })

      event.carClasses.forEach((cc) => registeredClasses.add(cc.name))

      return {
        name: event.name,
        track: event.track,
        startTime: event.startTime,
        endTime: event.endTime,
        raceTimes: raceTimes,
        tempValue: event.tempValue,
        precipChance: event.precipChance,
        carClasses: Array.from(registeredClasses).sort(),
        registeredUsers: Array.from(registeredUserMap.values()),
        eventUrl: `${baseUrl}/events?eventId=${event.id}`,
      }
    })

    const { sendWeeklyScheduleNotification, verifyNotificationsChannel, verifyGuildAccess } =
      await import('@/lib/discord')
    const success = await sendWeeklyScheduleNotification(formattedEvents)

    let locationInfo = ''
    if (success) {
      const [channel, guild] = await Promise.all([
        verifyNotificationsChannel(),
        verifyGuildAccess(),
      ])
      const channelName = channel?.name || 'Unknown Channel'
      const guildName = guild?.name || 'Unknown Server'
      locationInfo = `\nSent to #${channelName} in ${guildName}.`
    }

    return {
      success,
      count: events.length,
      message: success
        ? `Notification sent successfully!${locationInfo}`
        : 'Failed to send notification via Discord API.',
    }
  } catch (error) {
    logger.error({ err: error }, 'Error triggering weekly report')
    return { success: false, message: 'Internal server error' }
  }
}

export async function backfillDiscordNicknamesAction() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized' }
    }

    const accounts = await prisma.account.findMany({
      where: { provider: 'discord' },
      select: { providerAccountId: true, userId: true, user: { select: { name: true } } },
    })

    const { checkGuildMembership } = await import('@/lib/discord')

    const validAccounts = accounts.filter((a) => a.providerAccountId)
    let skipped = accounts.length - validAccounts.length
    let failed = 0

    // Fetch nicknames sequentially to avoid overwhelming the Discord API rate limits
    const toUpdate: { userId: string; nick: string }[] = []
    for (const account of validAccounts) {
      try {
        const res = await checkGuildMembership(account.providerAccountId!)
        if (res.nick && res.nick !== account.user.name) {
          toUpdate.push({ userId: account.userId, nick: res.nick })
        } else {
          skipped++
        }
      } catch (err) {
        logger.error(
          { err, discordId: account.providerAccountId },
          'Failed to fetch Discord nickname'
        )
        failed++
      }
    }

    // Batch all DB writes in a single transaction
    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map(({ userId, nick }) =>
          prisma.user.update({ where: { id: userId }, data: { name: nick } })
        )
      )
    }

    return {
      success: true,
      message: `Done. Updated: ${toUpdate.length}, Skipped (no nick or already current): ${skipped}, Failed: ${failed}.`,
    }
  } catch (error) {
    logger.error({ err: error }, 'Error running Discord nickname backfill')
    return { success: false, message: 'Internal server error' }
  }
}
