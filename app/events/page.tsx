import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SyncButton from '../components/SyncButton'
import EventFilters from '../components/EventFilters'
import FormattedDate from '@/components/FormattedDate'
import { Prisma } from '@prisma/client'
import type { CSSProperties } from 'react'

import styles from './events.module.css'

interface PageProps {
  searchParams: Promise<{
    signups?: string
    carClass?: string
    racer?: string
    from?: string
    to?: string
    sort?: string
    name?: string
  }>
}

interface WeekGroup {
  weekStart: Date
  weekEnd: Date
  weekNumber: number
  events: EventWithRaces[]
  meta: {
    events: number
    tracks: Set<string>
    classes: Set<string>
  }
}

type EventWithRaces = Prisma.EventGetPayload<{
  include: {
    races: {
      include: {
        registrations: {
          include: {
            user: { select: { name: true } }
          }
        }
      }
    }
  }
}>

type RaceWithRegistrations = EventWithRaces['races'][number]
type RegistrationWithUser = RaceWithRegistrations['registrations'][number]

type LicenseStyle = CSSProperties & {
  ['--licColor']?: string
  ['--licBorder']?: string
  ['--licText']?: string
  ['--licFill']?: string
}

export default async function EventsPage({ searchParams }: PageProps) {
  const session = await auth()
  const params = await searchParams

  if (!session) {
    redirect('/login')
  }

  // Fetch unique car classes for the filter dropdown
  const registrations: { carClass: string }[] = await prisma.registration.findMany({
    select: { carClass: true },
    distinct: ['carClass'],
  })
  const carClasses = registrations.map((r) => r.carClass).sort()

  // Fetch unique racers (users who have signed up)
  const distinctUsers: { user: { id: string; name: string | null } }[] =
    await prisma.registration.findMany({
      select: {
        user: {
          select: { id: true, name: true },
        },
      },
      distinct: ['userId'],
    })
  const racers = distinctUsers
    .map((r) => r.user)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Build Prisma filter object (similar to dashboard)
  const where: Prisma.EventWhereInput = {}

  if (params.signups === 'any') {
    where.races = { some: { registrations: { some: {} } } }
  } else if (params.signups === 'none') {
    where.races = { every: { registrations: { none: {} } } }
  } else if (params.signups === 'mine' && session.user?.id) {
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

  if (params.carClass) {
    where.races = {
      ...where.races,
      some: {
        registrations: {
          some: {
            carClass: params.carClass,
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

  if (params.from) {
    startTimeFilter.gte = new Date(params.from)
  } else {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    startTimeFilter.gte = today
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

  const events: EventWithRaces[] = await prisma.event.findMany({
    where,
    include: {
      races: {
        include: {
          registrations: {
            include: {
              user: {
                select: { name: true },
              },
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

  // Group events by week (ISO week)
  function getISOWeekKey(date: Date): string {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return `${d.getFullYear()}-W${weekNum}`
  }

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function getWeekEnd(date: Date): Date {
    const start = getWeekStart(date)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return end
  }

  function getWeekNumber(date: Date): number {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return weekNum
  }

  const weekMap = new Map<string, WeekGroup>()

  events.forEach((event) => {
    const weekKey = getISOWeekKey(event.startTime)
    const weekStart = getWeekStart(event.startTime)

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        weekStart,
        weekEnd: getWeekEnd(weekStart),
        weekNumber: getWeekNumber(event.startTime),
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
  })

  const weeks = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  )

  // --- TEST: inject a mock 4th event into the matching week by date (UI-only) ---
  try {
    const now = new Date()
    const mockEvent: EventWithRaces = {
      id: 'mock-week3-extra',
      externalId: null,
      name: 'Mock Extra Event Week 3 (test)',
      track: 'Test Circuit',
      startTime: new Date('2026-01-17T19:00:00Z'),
      endTime: new Date('2026-01-17T21:00:00Z'),
      description: null,
      races: [
        {
          id: 'mock-race-1',
          externalId: null,
          startTime: new Date('2026-01-17T19:00:00Z'),
          endTime: new Date('2026-01-17T21:00:00Z'),
          eventId: 'mock-week3-extra',
          registrations: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
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

  function licenseForId(id: string) {
    const map = ['A', 'B', 'C', 'D', 'R']
    let sum = 0
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
    return map[sum % map.length]
  }

  function licenseColor(letter: string) {
    switch (String(letter).toUpperCase()) {
      case 'A':
        return '#3b82f6'
      case 'B':
        return '#22c55e'
      case 'C':
        return '#facc15'
      case 'D':
        return '#fb923c'
      default:
        return '#ef4444'
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.topRow}>
        <h1>Upcoming Events</h1>
        <SyncButton />
      </div>

      <EventFilters carClasses={carClasses} racers={racers} currentFilters={params} />

      <section className={styles.weekGrid}>
        {weeks.map((week, idx) => (
          <div
            key={week.weekStart.toISOString()}
            className={`${styles.weekTile} ${idx % 2 ? styles.alt : ''}`}
          >
            <div className={styles.weekHeader}>
              <div className={styles.weekTitle}>
                <div className={styles.wk}>Week {week.weekNumber}</div>
                <div className={styles.range}>
                  {week.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                  {week.weekEnd.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <div className={styles.meta}>
                  {week.meta.events} events • {week.meta.tracks.size} tracks
                </div>
              </div>
              <div className={styles.weekBadge}>
                <div className={styles.pill}>W{week.weekNumber}</div>
              </div>
            </div>

            <div className={styles.weekBody}>
              {week.events.map((event) => {
                const totalSignups = event.races.reduce(
                  (sum: number, race: RaceWithRegistrations) => sum + race.registrations.length,
                  0
                )
                const license = licenseForId(event.id)
                const licenseStyle: LicenseStyle = {
                  ['--licColor']: licenseColor(license),
                }

                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className={styles.eventRow}
                    style={licenseStyle}
                  >
                    <div className={styles.eventLeft}>
                      <div className={styles.eventTopLine}>
                        <div className={styles.eventName} title={event.name}>
                          {event.name}
                        </div>
                        <div
                          className={styles.licenseBadge}
                          title={`License ${license}`}
                          style={{
                            borderColor: licenseColor(license),
                            color: licenseColor(license),
                            backgroundColor: `${licenseColor(license)}30`,
                          }}
                        >
                          {license} 2.0
                        </div>
                      </div>

                      <div className={styles.eventTrack}>
                        <span className={styles.trackDot}></span>
                        <span>{event.track}</span>
                      </div>

                      <div className={styles.subRow}>
                        <div className={styles.eventTimes}>
                          <FormattedDate date={event.startTime} />
                        </div>
                        <div className={styles.classPills}>
                          {event.races
                            .flatMap((r: RaceWithRegistrations) =>
                              r.registrations.map((reg: RegistrationWithUser) => reg.carClass)
                            )
                            .filter(
                              (cls: string, i: number, arr: string[]) => arr.indexOf(cls) === i
                            )
                            .slice(0, 3)
                            .map((carClass: string) => (
                              <div key={carClass} className={styles.classPill}>
                                {carClass}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.eventRight}>
                      <div
                        className={styles.driverPill}
                        title={`${totalSignups} driver${totalSignups === 1 ? '' : 's'} signed up`}
                      >
                        👤 {totalSignups}
                      </div>
                      <div className={styles.srText}>Click event to view</div>
                    </div>
                  </Link>
                )
              })}
            </div>

            <div className={styles.weekFooter}>
              <span>Tip: click an event row to view details</span>
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}
