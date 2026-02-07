import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import DropRegistrationButton from '@/components/DropRegistrationButton'
import EditableCarClass from '@/components/EditableCarClass'
import EditableRaceTime from '@/components/EditableRaceTime'

import styles from './registrations.module.css'

interface Props {
  params: Promise<{ userId: string }>
}

export default async function UserRegistrationsPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { userId } = await params
  const isAdmin = session.user?.role === 'ADMIN'

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
          event: {
            include: {
              carClasses: true,
              races: true,
            },
          },
        },
      },
      carClass: true,
      team: true,
    },
    orderBy: {
      race: {
        startTime: 'desc',
      },
    },
  })

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {user.name === session.user?.name ? 'My Registrations' : `${user.name}'s Registrations`}
        </h1>
      </header>

      <div className={styles.tableCard}>
        {registrations.length === 0 ? (
          <p className={styles.emptyText}>No registrations found for {user.name}.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Event</th>
                  <th className={styles.th}>Race Time</th>
                  <th className={styles.th}>Track</th>
                  <th className={styles.th}>Car Class</th>
                  <th className={styles.th}>Team</th>
                  {(userId === session.user?.id || session.user?.role === 'ADMIN') && (
                    <th className={styles.th}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => (
                  <tr key={reg.id} className={styles.tr}>
                    <td className={`${styles.td} ${styles.eventCell}`} data-label="Event">
                      <div className={styles.eventLine}>
                        <Link
                          href={`/events?eventId=${reg.race.eventId}`}
                          className={styles.eventName}
                        >
                          {reg.race.event.name}
                        </Link>
                        <span className={styles.trackText}>{reg.race.event.track}</span>
                      </div>
                    </td>
                    <td className={styles.td} data-label="Race Time">
                      <div className={styles.timePill}>
                        <EditableRaceTime
                          registrationId={reg.id}
                          currentRaceId={reg.raceId}
                          currentRaceStartTime={reg.race.startTime}
                          availableRaces={reg.race.event.races.map((r) => ({
                            id: r.id,
                            startTime: r.startTime,
                          }))}
                          readOnly={
                            (!isAdmin && userId !== session.user?.id) ||
                            new Date() > reg.race.endTime
                          }
                        />
                      </div>
                    </td>
                    <td className={styles.td} data-label="Car Class">
                      <div className={styles.classPill}>
                        <EditableCarClass
                          registrationId={reg.id}
                          currentCarClassId={reg.carClassId}
                          currentCarClassShortName={reg.carClass.shortName}
                          carClasses={reg.race.event.carClasses}
                          readOnly={
                            (!isAdmin && userId !== session.user?.id) ||
                            new Date() > reg.race.endTime
                          }
                          showLabel={false}
                          variant="table"
                        />
                      </div>
                    </td>
                    <td className={styles.td} data-label="Team">
                      {reg.team ? (
                        <span className={styles.teamPill}>{reg.team.name}</span>
                      ) : (
                        <span className={styles.teamPill}>Team Unassigned</span>
                      )}
                    </td>
                    {(userId === session.user?.id || session.user?.role === 'ADMIN') && (
                      <td className={styles.td} data-label="Actions">
                        {new Date() > reg.race.endTime ? (
                          <span className={styles.completedText}>Completed</span>
                        ) : (
                          <DropRegistrationButton registrationId={reg.id} />
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
