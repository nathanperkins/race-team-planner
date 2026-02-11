import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import EventFilters from '../components/EventFilters'
import LastSyncStatus from '@/components/LastSyncStatus'
import EventsClient from '../components/EventsClient'
import { Prisma } from '@prisma/client'
import { getLicenseLevelFromName, getLicenseForId, isLicenseEligible } from '@/lib/utils'

import styles from './events.module.css'
import { getIracingSeasonInfo } from '@/lib/season-utils'

interface PageProps {
  searchParams: Promise<{
    registrations?: string
    carClass?: string
    racer?: string
    from?: string
    to?: string
    name?: string
    eligible?: string
    eventId?: string
  }>
}

interface WeekGroup {
  weekStart: Date
  weekEnd: Date
  weekNumber: number
  seasonYear?: number
  seasonQuarter?: number
  official?: boolean
  events: EventWithRaces[]
  meta: {
    events: number
    tracks: Set<string>
    classes: Set<string>
  }
}

type EventWithRaces = Prisma.EventGetPayload<{
  include: {
    carClasses: true
    races: {
      include: {
        registrations: {
          include: {
            user: { select: { name: true; id: true; image: true; racerStats: true } }
            carClass: true
            team: true
            manualDriver: true
          }
        }
      }
    }
  }
}>

export default async function EventsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session) redirect('/login')

  // TODO (kaelan): Convert to hook
  const params = await searchParams

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { racerStats: true },
  })
  const preferredStats =
    currentUser?.racerStats?.find((s) => s.categoryId === 5) ?? currentUser?.racerStats?.[0]
  const userLicenseLevel = getLicenseLevelFromName(preferredStats?.groupName)

  // Fetch unique racers (users who have signed up)
  const racers = await prisma.user.findMany({
    where: {
      registrations: {
        some: {},
      },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  })

  // Build Prisma filter object (similar to dashboard)
  const where: Prisma.EventWhereInput = {}

  if (params.registrations === 'any') {
    where.races = { some: { registrations: { some: {} } } }
  } else if (params.registrations === 'none') {
    where.races = { every: { registrations: { none: {} } } }
  } else if (params.registrations === 'mine' && session.user?.id) {
    where.races = {
      some: {
        registrations: {
          some: {
            userId: session.user.id,
          },
        },
      },
    }
  }

  if (params.racer) {
    const racerIds = params.racer.split(',')
    const andConditions: Prisma.EventWhereInput[] = []

    racerIds.forEach((id) => {
      andConditions.push({
        races: {
          some: {
            registrations: {
              some: {
                userId: id,
              },
            },
          },
        },
      })
    })

    where.AND = andConditions
  }

  // Time filtering
  const startTimeFilter: Prisma.DateTimeFilter = {}

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  if (params.from) {
    startTimeFilter.gte = new Date(params.from)
  } else {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    startTimeFilter.gte = getWeekStart(today)
  }

  if (params.to) {
    startTimeFilter.lte = new Date(params.to)
  }

  where.startTime = startTimeFilter

  if (params.name) {
    where.OR = [
      { name: { contains: params.name, mode: 'insensitive' } },
      { track: { contains: params.name, mode: 'insensitive' } },
    ]
  }

  // Fetch unique car classes for the filter dropdown based on current filters
  const carClasses = await prisma.carClass.findMany({
    where: {
      events: {
        some: where,
      },
    },
    orderBy: { shortName: 'asc' },
  })

  // Finally add car class filter to events query
  if (params.carClass) {
    where.carClasses = {
      some: {
        id: params.carClass,
      },
    }
  }

  let events: EventWithRaces[] = await prisma.event.findMany({
    where,
    include: {
      carClasses: true,
      races: {
        include: {
          registrations: {
            include: {
              user: {
                include: {
                  racerStats: true,
                },
              },
              carClass: true,
              team: true,
              manualDriver: true,
            },
          },
        },
        orderBy: {
          startTime: 'asc',
        },
      },
    },
    orderBy: {
      startTime: 'asc',
    },
  })

  // Event discussion threads are event-level; mirror the first available thread ID
  // across all timeslots for display consistency.
  events.forEach((event) => {
    const eventThreadId = event.races.find(
      (race) => race.discordTeamsThreadId
    )?.discordTeamsThreadId
    if (!eventThreadId) return
    event.races.forEach((race) => {
      race.discordTeamsThreadId = race.discordTeamsThreadId ?? eventThreadId
    })
  })

  // Apply eligible filter if requested
  if (params.eligible === 'true') {
    events = events.filter((event) => {
      const license = getLicenseForId(event.id, event.licenseGroup)
      return isLicenseEligible(userLicenseLevel, license)
    })
  }

  // Group events by Season Info
  // We use a Map to group by a unique key (S{Year}Q{Quarter}W{Week})
  // But we want to preserve the order based on time.
  const weekMap = new Map<string, WeekGroup>()

  events.forEach((event) => {
    const seasonInfo = getIracingSeasonInfo(event.startTime)

    const weekKey = `S${seasonInfo.seasonYear}-Q${seasonInfo.seasonQuarter}-W${seasonInfo.raceWeek}`

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekStart: seasonInfo.weekStart,
        weekEnd: seasonInfo.weekEnd,
        weekNumber: seasonInfo.raceWeek,
        seasonYear: seasonInfo.seasonYear,
        seasonQuarter: seasonInfo.seasonQuarter,
        official: true, // Calculated weeks are "official" in terms of schedule
        events: [],
        meta: {
          events: 0,
          tracks: new Set(),
          classes: new Set(),
        },
      })
    }

    const week = weekMap.get(weekKey)!
    week.events.push(event)
    week.meta.events++
    week.meta.tracks.add(event.track)
    event.carClasses.forEach((cc) => week.meta.classes.add(cc.shortName))
  })

  const weeks = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  )

  const rawTeams = await prisma.team.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      teamMembers: {
        select: { id: true },
      },
    },
  })
  const teams = rawTeams.map((team) => ({
    id: team.id,
    name: team.alias || team.name,
    iracingTeamId: team.iracingTeamId,
    memberCount: team.teamMembers.length,
  }))

  // --- TEST: inject a mock 4th event into the matching week by date (UI-only) ---
  try {
    const now = new Date()
    const mockEvent: EventWithRaces = {
      id: 'mock-week3-extra',
      externalId: null,
      name: 'Mock Extra Event Week 3 (test)',
      track: 'Test Circuit',
      trackConfig: null,
      startTime: new Date('2026-01-17T19:00:00Z'),
      endTime: new Date('2026-01-17T21:00:00Z'),
      description: null,
      customCarClasses: [],
      carClasses: [],
      races: [
        {
          id: 'mock-race-1',
          externalId: null,
          startTime: new Date('2026-01-17T19:00:00Z'),
          endTime: new Date('2026-01-17T21:00:00Z'),
          eventId: 'mock-week3-extra',
          teamsAssigned: false,
          discordTeamsThreadId: null,
          discordTeamsSnapshot: null,
          discordTeamThreads: null,
          maxDriversPerTeam: null,
          teamAssignmentStrategy: 'BALANCED_IRATING',
          registrations: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      licenseGroup: 3,
      durationMins: null,
      tempValue: null,
      tempUnits: null,
      relHumidity: null,
      skies: null,
      precipChance: null,
      createdAt: now,
      updatedAt: now,
    }
    const target = weeks.find((w) => {
      const s = new Date(w.weekStart).getTime()
      const e = new Date(w.weekEnd).getTime()
      const t = new Date(mockEvent.startTime).getTime()
      return t >= s && t <= e
    })
    if (target) {
      target.events.push(mockEvent)
      target.meta.events = (target.meta.events || 0) + 1
      target.meta.tracks.add(mockEvent.track)
      target.events.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
    }
  } catch {}

  // Serialize weeks data for client component (convert Sets to arrays)
  const serializedWeeks = weeks.map((week) => ({
    ...week,
    meta: {
      events: week.meta.events,
      tracks: Array.from(week.meta.tracks),
      classes: Array.from(week.meta.classes),
    },
  }))

  return (
    <main className={styles.main}>
      <div className={styles.topRow}>
        <div className={styles.titleGroup}>
          <h1>Upcoming Events</h1>
          <LastSyncStatus />
        </div>
      </div>

      <EventFilters carClasses={carClasses} racers={racers} currentFilters={params} />

      <EventsClient
        weeks={serializedWeeks}
        isAdmin={session.user.role === 'ADMIN'}
        userId={session.user.id}
        userLicenseLevel={userLicenseLevel}
        initialEventId={params.eventId}
        teams={teams}
        discordGuildId={process.env.DISCORD_GUILD_ID}
      />
    </main>
  )
}
