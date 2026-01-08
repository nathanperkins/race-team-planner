
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"

import styles from "./dashboard.module.css"

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  const events = await prisma.event.findMany({
    orderBy: {
      startTime: 'asc',
    },
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
         <h1 className={styles.title}>Upcoming Events</h1>
         <div className={styles.nav}>
            <Link href={`/users/${session.user?.id}/signups`} className={styles.link}>My Signups</Link>
            <span className={styles.userInfo}>Signed in as {session.user?.name}</span>
            <Link href="/" className={styles.link}>Home</Link>
         </div>
      </header>

      <div className={styles.grid}>
        {events.map((event) => (
          <div key={event.id} className={styles.card}>
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
            <p className={styles.emptyState}>No upcoming events found.</p>
        )}
      </div>
    </div>
  )
}
