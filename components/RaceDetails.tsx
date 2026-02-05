import Image from 'next/image'
import FormattedDate from './FormattedDate'
import styles from './RaceDetails.module.css'
import DropRegistrationButton from './DropRegistrationButton'
import QuickRegistration from './QuickRegistration'
import EditableCarClass from './EditableCarClass'
import AdminDriverSearch from './AdminDriverSearch'

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
      racerStats: Array<{
        category: string
        categoryId: number
        irating: number
        groupName: string
      }>
    }
  }>
}

interface Driver {
  id: string
  name: string | null
  image: string | null
}

interface Props {
  race: RaceWithRegistrations
  userId: string
  isAdmin?: boolean
  carClasses: { id: string; name: string; shortName: string }[]
  allDrivers?: Driver[]
  dateFormat?: Intl.DateTimeFormatOptions
}

export default function RaceDetails({
  race,
  userId,
  isAdmin = false,
  carClasses,
  allDrivers = [],
  dateFormat,
}: Props) {
  const now = new Date()
  const isRaceCompleted = now > new Date(race.endTime)
  const isRaceLive = now >= new Date(race.startTime) && now <= new Date(race.endTime)

  const isUserRegistered = race.registrations.some((reg) => reg.userId === userId)
  const registeredUserIds = race.registrations.map((reg) => reg.userId)

  // Get the last driver's car class for default
  const lastDriverCarClass =
    race.registrations.length > 0
      ? race.registrations[race.registrations.length - 1].carClass.id
      : carClasses[0]?.id || ''

  return (
    <div className={styles.raceCard}>
      <div className={styles.raceHeader}>
        <h4 className={styles.raceTitle}>
          Race:{' '}
          <FormattedDate
            date={race.startTime}
            format={
              dateFormat || {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
              }
            }
          />
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
                  {reg.user.racerStats && reg.user.racerStats.length > 0 && (
                    <p className={styles.driverStats}>
                      {(
                        reg.user.racerStats.find(
                          (s) => s.categoryId === 5 || s.category?.toLowerCase() === 'sports car'
                        ) || reg.user.racerStats[0]
                      ).irating.toLocaleString()}{' '}
                      iR •{' '}
                      {
                        (
                          reg.user.racerStats.find(
                            (s) => s.categoryId === 5 || s.category?.toLowerCase() === 'sports car'
                          ) || reg.user.racerStats[0]
                        ).groupName
                      }
                    </p>
                  )}
                  <EditableCarClass
                    registrationId={reg.id}
                    currentCarClassId={reg.carClass.id}
                    currentCarClassShortName={reg.carClass.shortName}
                    carClasses={carClasses}
                    readOnly={(!isAdmin && reg.userId !== userId) || isRaceCompleted}
                  />
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

      {isAdmin && !isRaceCompleted && (
        <div className={styles.registrationControls}>
          <div className={styles.adminSearchWrapper}>
            <AdminDriverSearch
              raceId={race.id}
              registeredUserIds={registeredUserIds}
              allDrivers={allDrivers}
              defaultCarClassId={lastDriverCarClass}
            />
          </div>
          {!isUserRegistered && (
            <div className={styles.quickRegWrapper}>
              <QuickRegistration raceId={race.id} carClasses={carClasses} compact />
            </div>
          )}
        </div>
      )}

      {!isUserRegistered && !isRaceCompleted && !isAdmin && (
        <QuickRegistration raceId={race.id} carClasses={carClasses} />
      )}
    </div>
  )
}
