
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import SyncButton from "../components/SyncButton"
import EventFilters from "../components/EventFilters"
import { Cloud, User } from "lucide-react"

import styles from "./dashboard.module.css"

interface PageProps {
  searchParams: Promise<{
    hasSignups?: string;
    carClass?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await auth()
  const params = await searchParams

  if (!session) {
    redirect("/login")
  }

  // Fetch unique car classes for the filter dropdown
  const registrations = await prisma.registration.findMany({
    select: { carClass: true },
    distinct: ['carClass'],
  })
  const carClasses = registrations.map(r => r.carClass).sort()

  // Build Prisma filter object
  const where: any = {}

  if (params.hasSignups === "true") {
    where.registrations = { some: {} }
  } else if (params.hasSignups === "false") {
    where.registrations = { none: {} }
  }

  if (params.carClass) {
    where.registrations = {
      ...where.registrations,
      some: { carClass: params.carClass }
    }
  }

  if (params.from || params.to) {
    where.startTime = {}
    if (params.from) where.startTime.gte = new Date(params.from)
    if (params.to) where.startTime.lte = new Date(params.to)
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: {
      startTime: 'asc',
    },
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
         <h1 className={styles.title}>Upcoming Events</h1>
         <SyncButton />
      </header>

      <EventFilters carClasses={carClasses} currentFilters={params} />

      <div className={styles.grid}>
        {events.map((event) => (
          <div key={event.id} className={styles.card}>
            <div
              className={styles.sourceBadge}
              data-tooltip={event.externalId ? "Synced from iRacing" : "Manually entered"}
            >
              {event.externalId ? <Cloud size={14} /> : <User size={14} />}
            </div>
            <div className={styles.cardHeader}>
               <h2 className={styles.cardTitle}>{event.name}</h2>
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
                className={styles.viewButton}
            >
                View Details
            </Link>
          </div>
        ))}

        {events.length === 0 && (
            <p className={styles.emptyState}>No upcoming events found matching your filters.</p>
        )}
      </div>
    </div>
  )
}
