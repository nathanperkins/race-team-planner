'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import EventDetailModal from './EventDetailModal'
import { Prisma } from '@prisma/client'
import styles from '../events/events.module.css'
import {
  getLicenseForId,
  getLicenseColor,
  formatDuration,
  getSeriesNameOnly,
  isLicenseEligible,
  LicenseLevel,
} from '@/lib/utils'
import type { CSSProperties } from 'react'
import { ShieldCheck, ShieldX, Timer, User } from 'lucide-react'

type EventWithRaces = Prisma.EventGetPayload<{
  include: {
    carClasses: true
    races: {
      include: {
        registrations: {
          include: {
            user: {
              include: {
                racerStats: true
              }
            }
            carClass: true
            team: true
            manualDriver: true
          }
        }
      }
    }
  }
}>

type LicenseStyle = CSSProperties & {
  ['--licColor']?: string
}

interface EventsClientProps {
  weeks: Array<{
    weekStart: Date
    weekEnd: Date
    weekNumber: number
    seasonYear?: number
    seasonQuarter?: number
    official?: boolean
    events: EventWithRaces[]
    meta: {
      events: number
      tracks: string[]
      classes: string[]
    }
  }>
  isAdmin: boolean
  userId: string
  userLicenseLevel: LicenseLevel | null
  initialEventId?: string
  teams: Array<{ id: string; name: string; iracingTeamId: number | null; memberCount?: number }>
  discordGuildId?: string
  eligibleFilter?: boolean
}

function eligibleWeeks(userLicenseLevel: LicenseLevel | null, eligibleFilter: boolean | undefined) {
  return function(week: { events: EventWithRaces[] }) {
    return week.events.some(eligibleEvents(userLicenseLevel, eligibleFilter))
  }
}

function eligibleEvents(userLicenseLevel: LicenseLevel | null, eligibleFilter: boolean | undefined) {
  return function(event: EventWithRaces) {
    if (!eligibleFilter) return true
    const license = getLicenseForId(event.id, event.licenseGroup)
    return isLicenseEligible(userLicenseLevel, license)
  }
}

export default function EventsClient({
  weeks,
  isAdmin,
  userId,
  userLicenseLevel,
  initialEventId,
  teams,
  discordGuildId,
  eligibleFilter,
}: EventsClientProps) {
  const router = useRouter()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null)
  const now = new Date()

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null
    return weeks.flatMap((week) => week.events).find((evt) => evt.id === selectedEventId) || null
  }, [selectedEventId, weeks])

  // Update URL when event is selected
  const handleSelectEvent = (event: EventWithRaces) => {
    setSelectedEventId(event.id)
    router.push(`?eventId=${event.id}`, { scroll: false })
  }

  // Clear URL when modal is closed
  const handleCloseModal = () => {
    setSelectedEventId(null)
    router.push('?', { scroll: false })
  }

  return (
    <>
      <div className={styles.weekGrid}>
        {weeks.filter(eligibleWeeks(userLicenseLevel, eligibleFilter)).map((week, idx) => (
          <div
            key={week.weekNumber}
            className={`${styles.weekTile} ${idx % 2 === 1 ? styles.alt : ''}`}
          >
            <div className={styles.weekHeader}>
              <div className={styles.weekTitle}>
                <div className={styles.wk}>
                  {`${week.seasonYear} - Season ${week.seasonQuarter} - Week ${week.weekNumber}`}
                </div>
                <div className={styles.range}>
                  {week.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                  {week.weekEnd.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <div className={styles.meta}>{week.meta.events} events</div>
              </div>
              <div className={styles.weekBadge}>
                <div className={styles.pill}>W{week.weekNumber}</div>
              </div>
            </div>

            <div className={styles.weekBody}>
              {week.events.filter(eligibleEvents(userLicenseLevel, eligibleFilter)).map((event) => {
                const license = getLicenseForId(event.id, event.licenseGroup)
                const isEligible = isLicenseEligible(userLicenseLevel, license)
                const lastRaceEnd = event.races.reduce<Date | null>((latest, race) => {
                  const end = new Date(race.endTime)
                  if (!latest || end > latest) return end
                  return latest
                }, null)
                const isLive = event.races.some((race) => {
                  const start = new Date(race.startTime)
                  const end = new Date(race.endTime)
                  return now >= start && now <= end
                })
                const isCompleted = lastRaceEnd ? now > lastRaceEnd : now > new Date(event.endTime)
                const totalDrivers = event.races.reduce(
                  (sum, race) => sum + race.registrations.length,
                  0
                )
                const licenseStyle: LicenseStyle = {
                  ['--licColor']: getLicenseColor(license),
                }

                return (
                  <button
                    key={event.id}
                    onClick={() => handleSelectEvent(event)}
                    className={`${styles.eventRow} ${isCompleted ? styles.eventRowCompleted : ''} ${
                      !isEligible ? styles.eventRowIneligible : ''
                    }`}
                    style={licenseStyle}
                  >
                    {isCompleted && (
                      <div className={styles.eventRowOverlay} aria-hidden="true">
                        Race Completed
                      </div>
                    )}
                    <div className={styles.eventLeft}>
                      <div className={styles.eventTopLine}>
                        <div className={styles.eventTitleGroup}>
                          <div className={styles.eventName} title={event.name}>
                            {getSeriesNameOnly(event.name)}
                          </div>
                          {event.durationMins && (
                            <span className={styles.durationPill}>
                              <Timer size={12} />
                              {formatDuration(event.durationMins)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.eventTrack}>
                        <span className={styles.trackDot}></span>
                        {event.track}
                      </div>
                      <div className={styles.trackConfig}>{event.trackConfig || ''}</div>
                      <div className={`${styles.eventRight} ${styles.eventRightMobile}`}>
                        <div className={styles.eventRightTop}>
                          {isLive && (
                            <div className={styles.liveBadge}>
                              <span className={styles.liveDot} />
                              LIVE
                            </div>
                          )}
                          <div
                            className={styles.licenseBadge}
                            title={`License ${license}`}
                            style={{
                              borderColor: getLicenseColor(license),
                              color: getLicenseColor(license),
                              backgroundColor: `${getLicenseColor(license)}30`,
                            }}
                          >
                            {isEligible ? (
                              <ShieldCheck size={14} />
                            ) : (
                              <ShieldX size={14} color="#ef4444" />
                            )}
                            {license}
                          </div>
                        </div>
                        <div className={styles.driverPill}>
                          <User size={12} className={styles.driverIcon} />
                          {totalDrivers}
                        </div>
                      </div>

                      <div className={styles.racePills}>
                        {event.races.map((race) => {
                          const isRaceCompleted = now > new Date(race.startTime)
                          return (
                            <div
                              key={race.id}
                              className={`${styles.racePill} ${
                                isRaceCompleted ? styles.racePillCompleted : ''
                              }`}
                            >
                              {new Date(race.startTime).toLocaleDateString('en-US', {
                                month: 'numeric',
                                day: 'numeric',
                              })}{' '}
                              •{' '}
                              {new Date(race.startTime).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                              <span className={styles.racePillCount}>
                                <User size={12} />
                                {race.registrations.length}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <div className={styles.subRow}>
                        <div className={styles.classPills}>
                          {event.carClasses
                            .map((carClass) => carClass.shortName)
                            .filter(Boolean)
                            .slice(0, 3)
                            .map((carClass) => (
                              <div key={carClass} className={styles.classPill}>
                                {carClass}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className={`${styles.eventRight} ${styles.eventRightDesktop}`}>
                      <div className={styles.eventRightTop}>
                        {isLive && (
                          <div className={styles.liveBadge}>
                            <span className={styles.liveDot} />
                            LIVE
                          </div>
                        )}
                        <div
                          className={styles.licenseBadge}
                          title={`License ${license}`}
                          style={{
                            borderColor: getLicenseColor(license),
                            color: getLicenseColor(license),
                            backgroundColor: `${getLicenseColor(license)}30`,
                          }}
                        >
                          {isEligible ? (
                            <ShieldCheck size={14} />
                          ) : (
                            <ShieldX size={14} color="#ef4444" />
                          )}
                          {license}
                        </div>
                      </div>
                      <div className={styles.driverPill}>
                        <User size={12} className={styles.driverIcon} />
                        {totalDrivers}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className={styles.tipText}>Tip: click an event row to view details</div>
          </div>
        ))}
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={handleCloseModal}
          isAdmin={isAdmin}
          userId={userId}
          userLicenseLevel={userLicenseLevel}
          teams={teams}
          discordGuildId={discordGuildId}
        />
      )}
    </>
  )
}
