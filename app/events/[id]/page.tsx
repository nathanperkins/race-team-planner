import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import RaceRegistrationForm from '@/components/RaceRegistrationForm'
import RaceDetails from '@/components/RaceDetails'
import FormattedDate from '@/components/FormattedDate'
import {
  Cloud,
  ShieldCheck,
  Thermometer,
  Droplets,
  Sun,
  CloudSun,
  Timer,
  CloudRain,
  MapPin,
  Calendar,
} from 'lucide-react'
import { getLicenseForId, getLicenseColor, formatDuration } from '@/lib/utils'

import styles from './event.module.css'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      races: {
        include: {
          registrations: {
            include: {
              user: true,
              carClass: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
        orderBy: {
          startTime: 'asc',
        },
      },
      carClasses: true,
    },
  })

  if (!event) {
    notFound()
  }

  // Check if current user is already registered for ANY race in this event
  const userRegistrations = event.races
    .flatMap((race) => race.registrations)
    .filter((reg) => reg.userId === session.user?.id)

  const isCompleted = new Date() > event.endTime
  const license = getLicenseForId(event.id, event.licenseGroup)
  const licenseColor = getLicenseColor(license)

  return (
    <div className={styles.container}>
      {/* 1. Identity Header */}
      <header className={styles.eventHeader}>
        <div className={styles.headerTop}>
          {event.externalId && (
            <span className={styles.badge} title="Synced from iRacing">
              <Cloud size={14} /> Synced
            </span>
          )}
          <div
            className={styles.licenseBadgeLarge}
            style={{ '--licColor': licenseColor } as React.CSSProperties}
          >
            <ShieldCheck size={16} />
            {license}
          </div>
        </div>
        <h1 className={styles.eventTitle}>{event.name}</h1>
        <div className={styles.eventSubHeader}>
          <span className={styles.headerItem}>
            <MapPin size={16} /> {event.track}
          </span>
          <span className={styles.headerItem}>
            <Calendar size={16} /> <FormattedDate date={event.startTime} /> -{' '}
            <FormattedDate date={event.endTime} />
          </span>
        </div>
      </header>

      {/* 2. Environment & Stats Bar */}
      <div className={styles.statsBar}>
        <div className={styles.statsItem}>
          <Timer size={18} className={styles.statsIcon} />
          <div>
            <span className={styles.statsLabel}>Duration</span>
            <span className={styles.statsValue}>
              {event.durationMins ? formatDuration(event.durationMins) : 'N/A'}
            </span>
          </div>
        </div>

        {/* Weather Sub-group */}
        {(event.tempValue !== null ||
          event.relHumidity !== null ||
          event.precipChance !== null) && (
          <>
            <div className={styles.statsDivider} />
            <div className={styles.statsItem}>
              <Thermometer size={18} className={styles.statsIcon} />
              <div>
                <span className={styles.statsLabel}>Temp</span>
                <span className={styles.statsValue}>
                  {event.tempValue !== null
                    ? `${event.tempValue}°${event.tempUnits === 0 ? 'F' : 'C'}`
                    : 'N/A'}
                </span>
              </div>
            </div>
            <div className={styles.statsItem}>
              <Droplets size={18} className={styles.statsIcon} />
              <div>
                <span className={styles.statsLabel}>Humidity</span>
                <span className={styles.statsValue}>
                  {event.relHumidity !== null ? `${event.relHumidity}%` : 'N/A'}
                </span>
              </div>
            </div>
            <div className={styles.statsItem}>
              <CloudRain size={18} className={styles.statsIcon} />
              <div>
                <span className={styles.statsLabel}>Precip</span>
                <span className={styles.statsValue}>
                  {event.precipChance !== null ? `${event.precipChance}%` : 'N/A'}
                </span>
              </div>
            </div>
            <div className={styles.statsItem}>
              {event.skies === 0 ? (
                <Sun size={18} />
              ) : event.skies === 1 ? (
                <CloudSun size={18} />
              ) : (
                <Cloud size={18} />
              )}
              <div>
                <span className={styles.statsLabel}>Skies</span>
                <span className={styles.statsValue}>
                  {event.skies === 0
                    ? 'Clear'
                    : event.skies === 1
                      ? 'Partly Cloudy'
                      : event.skies === 2
                        ? 'Mostly'
                        : event.skies === 3
                          ? 'Overcast'
                          : 'N/A'}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. Content Grid */}
      <div className={styles.mainGrid}>
        {/* Left: Detail Feed */}
        <section className={styles.mainContent}>
          <div className={styles.contentCard}>
            <h2 className={styles.cardHeading}>About The Event</h2>
            <p className={styles.description}>
              {event.description || 'No additional information available for this event.'}
            </p>
          </div>

          <div className={styles.raceSection}>
            <h2 className={styles.cardHeading}>Races & Driver Lineups</h2>
            {event.races.length === 0 ? (
              <div className={styles.emptyNotice}>
                No race sessions have been defined for this event yet.
              </div>
            ) : (
              <div className={styles.raceList}>
                {event.races.map((race) => (
                  <RaceDetails
                    key={race.id}
                    race={race}
                    userId={session.user.id}
                    isAdmin={session.user.role === 'ADMIN'}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: Tactics & Registration */}
        <aside className={styles.sideContent}>
          <div className={styles.sideCard}>
            <h3 className={styles.cardTitle}>Registration</h3>
            {isCompleted ? (
              <div className={styles.eventClosed}>
                <p>🏁 Mapping Complete</p>
                <span>Registration is no longer available for this event.</span>
              </div>
            ) : (
              <div className={styles.formWrapper}>
                <RaceRegistrationForm
                  races={event.races.map((r) => ({
                    id: r.id,
                    startTime: r.startTime,
                    endTime: r.endTime,
                  }))}
                  carClasses={event.carClasses.map((cc) => ({
                    id: cc.id,
                    name: cc.name,
                    shortName: cc.shortName,
                  }))}
                  existingRegistrationRaceIds={userRegistrations.map((r) => r.raceId)}
                />
              </div>
            )}
          </div>

          <div className={styles.sideCardSecondary}>
            <h3 className={styles.cardTitleSmall}>Event Window</h3>
            <div className={styles.timeInfo}>
              <div className={styles.timeRow}>
                <span>Opens</span>
                <FormattedDate date={event.startTime} />
              </div>
              <div className={styles.timeRow}>
                <span>Closes</span>
                <FormattedDate date={event.endTime} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
