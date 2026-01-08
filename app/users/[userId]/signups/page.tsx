"use server"

import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"

import styles from "./signups.module.css"

interface Props {
  params: Promise<{ userId: string }>
}

export default async function UserSignupsPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect("/login")

  const { userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  // For now, any user is allowed to view anybody's sign-ups. We just want to
  // make sure they are a valid user.
  if (!user) {
    notFound()
  }

  const registrations = await prisma.registration.findMany({
    where: { userId },
    include: {
        event: true
    },
    orderBy: {
        event: {
            startTime: 'asc'
        }
    }
  })

  return (
    <div className={styles.container}>
      <div className={styles.backLinkContainer}>
        <Link href="/dashboard" className={styles.backLink}>
          &larr; Back to Dashboard
        </Link>
      </div>

      <header className={styles.header}>
         <h1 className={styles.title}>{user.name === session.user?.name ? "My Signups" : `${user.name}'s Signups`}</h1>
      </header>

      <div className={styles.tableCard}>
        {registrations.length === 0 ? (
            <p className={styles.emptyText}>No signups found for this user.</p>
        ) : (
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead className={styles.thead}>
                        <tr>
                            <th className={styles.th}>Event</th>
                            <th className={styles.th}>Date</th>
                            <th className={styles.th}>Track</th>
                            <th className={styles.th}>Car Class</th>
                            <th className={styles.th}>Timeslot</th>
                        </tr>
                    </thead>
                    <tbody>
                        {registrations.map((reg) => (
                            <tr key={reg.id} className={styles.tr}>
                                <td className={styles.td}>
                                    <Link href={`/events/${reg.eventId}`} className={styles.eventName}>
                                        {reg.event.name}
                                    </Link>
                                </td>
                                <td className={styles.td}>
                                    {new Date(reg.event.startTime).toLocaleString()}
                                </td>
                                <td className={styles.td}>{reg.event.track}</td>
                                <td className={styles.td}>
                                    <span className={styles.classBadge}>
                                        {reg.carClass}
                                    </span>
                                </td>
                                <td className={styles.td}>
                                    <span className={styles.timeslot}>
                                        {reg.preferredTimeslot || "—"}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  )
}
