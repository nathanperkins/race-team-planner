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

    // Create the event with a single race
    await prisma.event.create({
      data: {
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
      },
    })

    revalidatePath('/events')
    revalidatePath('/admin')

    return { message: 'Success' }
  } catch (error) {
    console.error('Error creating custom event:', error)
    return { message: 'Failed to create event. Please try again.' }
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
          if (reg.user.name) {
            const discordId = reg.user.accounts[0]?.providerAccountId
            registeredUserMap.set(reg.user.name, { name: reg.user.name, discordId })
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
        eventUrl: `${baseUrl}/events/${event.id}`,
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
