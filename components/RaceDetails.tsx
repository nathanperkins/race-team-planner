import Image from 'next/image'
import FormattedDate from './FormattedDate'
import { deleteRegistration } from '@/app/actions'
import styles from './RaceDetails.module.css'

interface RaceWithRegistrations {
  id: string
  startTime: Date
  endTime: Date
  registrations: Array<{
    id: string
    carClass: string
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
}

export default function RaceDetails({ race, userId }: Props) {
  const isRaceCompleted = new Date() > new Date(race.endTime)

  return (
    <div className={styles.raceCard}>
      <div className={styles.raceHeader}>
        <h4 className={styles.raceTitle}>
          Race: <FormattedDate date={race.startTime} />
        </h4>
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
                  <p className={styles.driverClass}>Class: {reg.carClass}</p>
                </div>
              </div>
              <div className={styles.driverTimeslot}>
                {reg.userId === userId && (
                  <form
                    action={async () => {
                      'use server'
                      await deleteRegistration(reg.id)
                    }}
                  >
                    <button type="submit" className={styles.deleteButtonSmall}>
                      Drop
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
