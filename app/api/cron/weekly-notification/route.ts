import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendWeeklyScheduleNotification } from '@/lib/discord'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api-cron-weekly-notification')

export async function GET(request: NextRequest) {
  // Authorization check (Cron Secret)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // 1. Determine "Upcoming Weekend" range.
    // Simplified logic: Look for events starting in the next 7 days.
    const startWindow = new Date()
    const endWindow = new Date()
    endWindow.setDate(endWindow.getDate() + 7)

    logger.info(
      `Fetching events between ${startWindow.toISOString()} and ${endWindow.toISOString()}`
    )

    // 2. Fetch Events
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
      logger.info('No events found for the weekend.')
      return NextResponse.json({ message: 'No events found', count: 0 })
    }

    // 3. Format Data for Discord
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const formattedEvents = events.map((event) => {
      // Collect unique car classes from registrations or the event definition
      // Note: Event.carClasses might be empty if we haven't synced robustly,
      // but Registrations definitely have classes.
      // Let's prefer Event.carClasses if available, or fall back to registered classes.

      const registeredClasses = new Set<string>()
      // Map user name to object to deduplicate by name but keep info
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

      // Also mix in event.carClasses
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

    // 4. Send Notification
    const success = await sendWeeklyScheduleNotification(formattedEvents)

    return NextResponse.json({
      success,
      count: events.length,
      message: success ? 'Notification sent' : 'Failed to send notification',
    })
  } catch (error) {
    logger.error({ err: error }, '[WeeklyNotification] Error')
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
