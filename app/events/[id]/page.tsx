import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'

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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { expectationsVersion: true },
  })

  const hasAgreedToExpectations = (user?.expectationsVersion ?? 0) >= CURRENT_EXPECTATIONS_VERSION

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
      <div className={styles.layout}>
        <div style={{ position: 'relative' }}>
          {event.externalId && (
            <div className={styles.sourceBadge} data-tooltip="Synced from iRacing">
              <Cloud size={16} />
            </div>
          )}
          <h1 className={styles.title}>{event.name}</h1>
          <div className={styles.meta}>
            <span className={styles.metaItem}>📍 {event.track}</span>
            <span className={styles.metaItem}>
              📅 <FormattedDate date={event.startTime} /> - <FormattedDate date={event.endTime} />
            </span>
            {event.durationMins && (
              <span className={styles.metaItem}>
                <Timer size={14} className="inline mr-1" />
                {formatDuration(event.durationMins)}
              </span>
            )}
            <span className={styles.metaItem}>
              <div
                className={styles.licenseBadge}
                style={{ '--licColor': licenseColor } as React.CSSProperties}
              >
                <ShieldCheck size={14} />
                {license}
              </div>
            </span>
          </div>

          <div className={styles.prose}>
            <h3 className="text-xl font-semibold">Event Description</h3>
            <p className="text-gray-300">{event.description || 'No description provided.'}</p>
          </div>

          <div className={styles.racesSection}>
            <h3 className={styles.sectionTitle}>Races & Driver Lineups</h3>
            {event.races.length === 0 ? (
              <p className="text-gray-500">No races scheduled for this event.</p>
            ) : (
              <div className={styles.raceList}>
                {event.races.map((race) => (
                  <RaceDetails
                    key={race.id}
                    race={race}
                    userId={session.user.id}
                    isAdmin={session.user.role === 'ADMIN'}
                    eventId={event.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className={styles.sidebar}>
            <h3 className={styles.sectionTitle}>Registration</h3>
            {isCompleted ? (
              <div className={styles.completedBox}>
                <p className={styles.completedTitle}>🏁 Event Completed</p>
                <p className={styles.completedDetail}>
                  This event ended on{' '}
                  <FormattedDate
                    date={event.endTime}
                    format={{ year: 'numeric', month: 'numeric', day: 'numeric' }}
                  />
                  . Registration is closed.
                </p>
              </div>
            ) : !hasAgreedToExpectations ? (
              <div className={styles.warningBox}>
                <p className={styles.warningTitle}>Action Required</p>
                <p className={styles.warningDetail}>
                  You must review and agree to the latest Team Expectations before signing up.
                </p>
                <a href="/expectations" className={styles.reviewButton}>
                  Review Expectations
                </a>
              </div>
            ) : (
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
            )}

            {(event.tempValue !== null || event.relHumidity !== null) && (
              <div className={styles.weatherGrid}>
                {event.tempValue !== null && (
                  <div className={styles.weatherBox}>
                    <span className={styles.weatherLabel}>
                      <Thermometer size={10} /> Temperature
                    </span>
                    <span className={styles.weatherValue}>
                      {event.tempValue}°{event.tempUnits === 0 ? 'F' : 'C'}
                    </span>
                  </div>
                )}
                {event.relHumidity !== null && (
                  <div className={styles.weatherBox}>
                    <span className={styles.weatherLabel}>
                      <Droplets size={10} /> Humidity
                    </span>
                    <span className={styles.weatherValue}>{event.relHumidity}%</span>
                  </div>
                )}
                {event.precipChance !== null && (
                  <div className={styles.weatherBox}>
                    <span className={styles.weatherLabel}>
                      <CloudRain size={10} /> Precipitation
                    </span>
                    <span className={styles.weatherValue}>{event.precipChance}%</span>
                  </div>
                )}
                {event.skies !== null && (
                  <div className={styles.weatherBox}>
                    <span className={styles.weatherLabel}>
                      {event.skies === 0 ? (
                        <Sun size={10} />
                      ) : event.skies === 1 ? (
                        <CloudSun size={10} />
                      ) : (
                        <Cloud size={10} />
                      )}{' '}
                      Skies
                    </span>
                    <span className={styles.weatherValue}>
                      {event.skies === 0
                        ? 'Clear'
                        : event.skies === 1
                          ? 'Partly Cloudy'
                          : event.skies === 2
                            ? 'Mostly Cloudy'
                            : event.skies === 3
                              ? 'Overcast'
                              : 'Unknown'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
