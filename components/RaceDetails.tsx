import Image from 'next/image'
import FormattedDate from './FormattedDate'
import styles from './RaceDetails.module.css'
import DropRegistrationButton from './DropRegistrationButton'
import QuickRegistration from './QuickRegistration'

interface RaceWithRegistrations {
  id: string
  startTime: Date
  endTime: Date
  registrations: Array<{
    id: string
    carClass: {
      id: string
      name: string
      shortName: string
    }
    userId: string
    user: {
      name: string | null
      image: string | null
    }
  }>
}

interface Props {
  race: RaceWithRegistrations
  userId: string
  isAdmin?: boolean
  carClasses: { id: string; name: string; shortName: string }[]
}

export default function RaceDetails({ race, userId, isAdmin = false, carClasses }: Props) {
  const now = new Date()
  const isRaceCompleted = now > new Date(race.endTime)
  const isRaceLive = now >= new Date(race.startTime) && now <= new Date(race.endTime)

  const isUserRegistered = race.registrations.some((reg) => reg.userId === userId)

  return (
    <div className={styles.raceCard}>
      <div className={styles.raceHeader}>
        <h4 className={styles.raceTitle}>
          Race: <FormattedDate date={race.startTime} />
        </h4>
        {isRaceLive && (
          <span className={styles.liveBadge}>
            <span className={styles.liveDot} />
            LIVE
          </span>
        )}
        {isRaceCompleted && <span className={styles.completedBadge}>Completed</span>}
      </div>

      {race.registrations.length === 0 ? (
        <p className="text-sm text-gray-500 mt-2">No drivers registered for this race.</p>
      ) : (
        <div className={styles.driverList}>
          {race.registrations.map((reg) => (
            <div key={reg.id} className={styles.driverRow}>
              <div className={styles.driverInfo}>
                {reg.user.image && (
                  <Image
                    src={reg.user.image}
                    alt={reg.user.name || 'User'}
                    width={32}
                    height={32}
                    className={styles.avatar}
                  />
                )}
                <div>
                  <p className={styles.driverName}>{reg.user.name}</p>
                  <p className={styles.driverClass}>Class: {reg.carClass.shortName}</p>
                </div>
              </div>
              <div className={styles.driverTimeslot}>
                {(reg.userId === userId || isAdmin) && !isRaceCompleted && (
                  <DropRegistrationButton registrationId={reg.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isUserRegistered && !isRaceCompleted && (
        <QuickRegistration raceId={race.id} carClasses={carClasses} />
      )}
    </div>
  )
}
