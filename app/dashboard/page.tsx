
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { redirect } from "next/navigation"
import Link from "next/link"
import SyncButton from "../components/SyncButton"
import EventFilters from "../components/EventFilters"
import { Cloud, Users } from "lucide-react"

import styles from "./dashboard.module.css"

interface PageProps {
  searchParams: Promise<{
    signups?: string;
    carClass?: string;
    racer?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}

import { features } from "@/lib/config"

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await auth()
  const params = await searchParams

  if (!session) {
    redirect("/login")
  }

  // Fetch unique car classes for the filter dropdown
  const registrations: { carClass: string }[] = await prisma.registration.findMany({
    select: { carClass: true },
    distinct: ['carClass'],
  })
  const carClasses = registrations.map(r => r.carClass).sort()

  // Fetch unique racers (users who have signed up)
  const distinctUsers: { user: { id: string; name: string | null } }[] = await prisma.registration.findMany({
    select: {
      user: {
        select: { id: true, name: true }
      }
    },
    distinct: ['userId'],
  })
  const racers = distinctUsers.map(r => r.user).sort((a, b) => (a.name || "").localeCompare(b.name || ""))

  // Build Prisma filter object
  const where: Prisma.EventWhereInput = {}

  if (params.signups === "any") {
    where.races = { some: { registrations: { some: {} } } }
  } else if (params.signups === "none") {
    where.races = { every: { registrations: { none: {} } } }
  } else if (params.signups === "mine" && session.user?.id) {
    where.races = {
      some: {
        registrations: {
          some: {
            userId: session.user.id
          }
        }
      }
    }
  }

  if (params.carClass) {
    where.races = {
      ...where.races,
      some: {
        registrations: {
          some: {
            carClass: params.carClass
          }
        }
      }
    }
  }

  if (params.racer) {
    const racerIds = params.racer.split(',')
    // Match events where ALL selected racers are present (AND logic)
    const andConditions: Prisma.EventWhereInput[] = []

    racerIds.forEach(id => {
      andConditions.push({
        races: {
          some: {
            registrations: {
              some: {
                userId: id
              }
            }
          }
        }
      })
    })

    // Assign array to AND (Prisma accepts EventWhereInput | EventWhereInput[])
    where.AND = andConditions
  }

  // Time filtering
  const startTimeFilter: Prisma.DateTimeFilter = {}

  if (params.from) {
    startTimeFilter.gte = new Date(params.from)
  } else {
    const today = new Date()
    today.setHours(0,0,0,0)
    startTimeFilter.gte = today
  }

  if (params.to) {
    startTimeFilter.lte = new Date(params.to)
  }

  where.startTime = startTimeFilter

  const events = await prisma.event.findMany({
    where,
    include: {
      races: {
        include: {
          registrations: {
            include: {
              user: {
                select: { name: true }
              }
            }
          }
        }
      }
    },
    orderBy: (() => {
      switch (params.sort) {
        case 'dateDesc':
          return { startTime: 'desc' };
        case 'name':
          return { name: 'asc' };
        case 'signups':
          // Sort by total signups across all races
          // Prisma doesn't easily support nested count sum sorting,
          // but we can sort by event name or date and then sort in memory
          // if signups sort is requested. For now, just use startTime as fallback.
          return { startTime: 'asc' };
        default: // 'date' or undefined
          return { startTime: 'asc' };
      }
    })(),
  })

  // Manual sorting for signups if requested
  if (params.sort === 'signups') {
    events.sort((a, b) => {
      const aCount = a.races.reduce((sum: number, r) => sum + r.registrations.length, 0)
      const bCount = b.races.reduce((sum: number, r) => sum + r.registrations.length, 0)
      return bCount - aCount
    })
  }

  // Prepare params for UI to reflect default filtering
  const displayParams = { ...params }
  if (!params.from) {
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      displayParams.from = `${year}-${month}-${day}`
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
         <h1 className={styles.title}>Upcoming Events</h1>
         {features.iracingSync && <SyncButton />}
      </header>

      <EventFilters carClasses={carClasses} racers={racers} currentFilters={displayParams} />

      <div className={styles.grid}>
        {events.map((event) => {
          const isCompleted = new Date() > event.endTime
          const totalRegistrations = event.races.reduce((sum: number, r) => sum + r.registrations.length, 0)
          const allDriverNames = Array.from(new Set(event.races.flatMap((r) => r.registrations.map((reg) => reg.user.name)))).filter(Boolean)

          return (
            <div key={event.id} className={`${styles.card} ${isCompleted ? styles.completedCard : ''}`}>
              <div className={styles.badgeContainer}>
                {event.externalId && (
                  <div
                    className={styles.sourceBadge}
                    data-tooltip="Synced from iRacing"
                  >
                    <Cloud size={14} />
                  </div>
                )}

                {totalRegistrations > 0 && (
                  <div
                    className={`${styles.signupBadge} ${styles.hasSignups}`}
                    data-tooltip={`Racers:\n${allDriverNames.join("\n")}`}
                  >
                    <Users size={14} />
                    <span>{totalRegistrations}</span>
                  </div>
                )}
              </div>

              <div className={styles.cardHeader}>
                 <h2 className={styles.cardTitle}>
                    {isCompleted && <span className={styles.completedIcon} title="Event Completed">🏁 </span>}
                    {event.name}
                 </h2>
                 <span className={styles.dateBadge}>
                    {new Date(event.startTime).toLocaleDateString()}
                 </span>
              </div>

              <p className={styles.trackName}>{event.track}</p>
              {event.description && (
                  <p className={styles.description}>{event.description}</p>
              )}

              <Link
                  href={`/events/${event.id}`}
                  className={`${styles.viewButton} ${isCompleted ? styles.completedButton : ''}`}
              >
                  {isCompleted ? "View Past Event" : "View Details"}
              </Link>
            </div>
          )
        })}

        {events.length === 0 && (
            <p className={styles.emptyState}>No upcoming events found matching your filters.</p>
        )}
      </div>
    </div>
  )
}
