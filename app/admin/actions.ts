'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

interface State {
  message: string
}

export async function createCustomEvent(prevState: State, formData: FormData): Promise<State> {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return { message: 'Unauthorized. Admin access required.' }
    }

    const name = formData.get('name') as string
    const track = formData.get('track') as string
    const trackConfig = formData.get('trackConfig') as string
    const description = formData.get('description') as string
    const startTime = formData.get('startTime') as string
    const durationMins = formData.get('durationMins') as string
    const licenseGroup = formData.get('licenseGroup') as string
    const tempValue = formData.get('tempValue') as string
    const tempUnits = formData.get('tempUnits') as string
    const relHumidity = formData.get('relHumidity') as string
    const skies = formData.get('skies') as string
    const precipChance = formData.get('precipChance') as string
    const carClassesInput = formData.get('carClassesInput') as string

    if (!name || !track || !startTime) {
      return { message: 'Name, track, and start time are required.' }
    }

    const startDate = new Date(startTime)

    if (isNaN(startDate.getTime())) {
      return { message: 'Invalid date format.' }
    }

    // Calculate end time based on duration (default to 1 hour if not provided)
    const duration = durationMins ? parseInt(durationMins) : 60
    const endDate = new Date(startDate.getTime() + duration * 60000)

    // Parse car classes from comma-separated input
    const customCarClasses = carClassesInput
      ? carClassesInput
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
      name,
      track,
      trackConfig: trackConfig || null,
      description: description || null,
      startTime: startDate,
      endTime: endDate,
      durationMins: durationMins ? parseInt(durationMins) : null,
      licenseGroup: licenseGroup ? parseInt(licenseGroup) : null,
      tempValue: tempValue ? parseInt(tempValue) : null,
      tempUnits: tempUnits ? parseInt(tempUnits) : null,
      relHumidity: relHumidity ? parseInt(relHumidity) : null,
      skies: skies ? parseInt(skies) : null,
      precipChance: precipChance ? parseInt(precipChance) : null,
      races: {
        create: {
          startTime: startDate,
          endTime: endDate,
        },
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
    console.error('Error creating custom event:', error)
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

    const name = formData.get('name') as string
    const track = formData.get('track') as string
    const trackConfig = formData.get('trackConfig') as string
    const description = formData.get('description') as string
    const startTime = formData.get('startTime') as string
    const durationMins = formData.get('durationMins') as string
    const licenseGroup = formData.get('licenseGroup') as string
    const tempValue = formData.get('tempValue') as string
    const tempUnits = formData.get('tempUnits') as string
    const relHumidity = formData.get('relHumidity') as string
    const skies = formData.get('skies') as string
    const precipChance = formData.get('precipChance') as string
    const carClassesInput = formData.get('carClassesInput') as string

    if (!name || !track || !startTime) {
      return { message: 'Name, track, and start time are required.' }
    }

    const startDate = new Date(startTime)

    if (isNaN(startDate.getTime())) {
      return { message: 'Invalid date format.' }
    }

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
    const duration = durationMins ? parseInt(durationMins) : 60
    const endDate = new Date(startDate.getTime() + duration * 60000)

    // Parse car classes from comma-separated input
    const customCarClasses = carClassesInput
      ? carClassesInput
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
        name,
        track,
        trackConfig: trackConfig || null,
        description: description || null,
        startTime: startDate,
        endTime: endDate,
        durationMins: durationMins ? parseInt(durationMins) : null,
        licenseGroup: licenseGroup ? parseInt(licenseGroup) : null,
        tempValue: tempValue ? parseInt(tempValue) : null,
        tempUnits: tempUnits ? parseInt(tempUnits) : null,
        relHumidity: relHumidity ? parseInt(relHumidity) : null,
        skies: skies ? parseInt(skies) : null,
        precipChance: precipChance ? parseInt(precipChance) : null,
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

      // Optional: Update associated races if they matched the old event window strictly?
      // For now, let's just assume custom events created via our tool have parallel races.
      // We will update ALL races for this event to the new times.
      // This might be destructive for complex events, but for "Custom Events" it's expected.
      await tx.race.updateMany({
        where: { eventId: eventId },
        data: {
          startTime: startDate,
          endTime: endDate,
        },
      })
    })

    revalidatePath('/events')
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/admin')

    return { message: 'Success' }
  } catch (error: unknown) {
    console.error('Error updating custom event:', error)
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
    console.error('Error deleting custom event:', error)
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
    console.error('Error triggering weekly report:', error)
    return { success: false, message: 'Internal server error' }
  }
}
