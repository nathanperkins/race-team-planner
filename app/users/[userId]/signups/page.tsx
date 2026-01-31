'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import FormattedDate from '@/components/FormattedDate'
import { deleteRegistration } from '@/app/actions'

import styles from './signups.module.css'

interface Props {
  params: Promise<{ userId: string }>
}

export default async function UserSignupsPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

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
      race: {
        include: {
          event: true,
        },
      },
      carClass: true,
    },
    orderBy: {
      race: {
        startTime: 'asc',
      },
    },
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {user.name === session.user?.name ? 'My Signups' : `${user.name}'s Signups`}
        </h1>
      </header>

      <div className={styles.tableCard}>
        {registrations.length === 0 ? (
          <p className={styles.emptyText}>No signups found for {user.name}.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Event</th>
                  <th className={styles.th}>Race Time</th>
                  <th className={styles.th}>Track</th>
                  <th className={styles.th}>Car Class</th>
                  {(userId === session.user?.id || session.user?.role === 'ADMIN') && (
                    <th className={styles.th}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => (
                  <tr key={reg.id} className={styles.tr}>
                    <td className={styles.td}>
                      <Link href={`/events/${reg.race.eventId}`} className={styles.eventName}>
                        {reg.race.event.name}
                      </Link>
                    </td>
                    <td className={styles.td}>
                      <FormattedDate date={reg.race.startTime} />
                    </td>
                    <td className={styles.td}>{reg.race.event.track}</td>
                    <td className={styles.td}>
                      <span className={styles.classBadge}>{reg.carClass.shortName}</span>
                    </td>
                    {(userId === session.user?.id || session.user?.role === 'ADMIN') && (
                      <td className={styles.td}>
                        {new Date() > reg.race.endTime ? (
                          <span className={styles.completedText}>Completed</span>
                        ) : (
                          <form
                            action={deleteRegistration.bind(
                              null,
                              reg.id,
                              `/users/${userId}/signups`
                            )}
                          >
                            <button type="submit" className={styles.deleteButton}>
                              Drop
                            </button>
                          </form>
                        )}
                      </td>
                    )}
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
