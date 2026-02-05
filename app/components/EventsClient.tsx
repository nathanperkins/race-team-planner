'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import EventDetailModal from './EventDetailModal'
import { Prisma } from '@prisma/client'
import styles from '../events/events.module.css'
import { getLicenseForId, getLicenseColor, formatDuration, getSeriesNameOnly } from '@/lib/utils'
import type { CSSProperties } from 'react'

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
    events: EventWithRaces[]
    meta: {
      events: number
      tracks: string[]
      classes: string[]
    }
  }>
  isAdmin: boolean
  userId: string
  initialEventId?: string
  teams: Array<{ id: string; name: string }>
}

export default function EventsClient({
  weeks,
  isAdmin,
  userId,
  initialEventId,
  teams,
}: EventsClientProps) {
  const router = useRouter()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null)

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
        {weeks.map((week, idx) => (
          <div
            key={week.weekNumber}
            className={`${styles.weekTile} ${idx % 2 === 1 ? styles.alt : ''}`}
          >
            <div className={styles.weekHeader}>
              <div className={styles.weekTitle}>
                <div className={styles.wk}>Week {week.weekNumber}</div>
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
              {week.events.map((event) => {
                const totalRegistrations = event.races.reduce(
                  (sum: number, race) => sum + race.registrations.length,
                  0
                )
                const license = getLicenseForId(event.id, event.licenseGroup)
                const licenseStyle: LicenseStyle = {
                  ['--licColor']: getLicenseColor(license),
                }

                return (
                  <button
                    key={event.id}
                    onClick={() => handleSelectEvent(event)}
                    className={styles.eventRow}
                    style={licenseStyle}
                  >
                    <div className={styles.eventLeft}>
                      <div className={styles.eventTopLine}>
                        <div className={styles.eventName} title={event.name}>
                          {getSeriesNameOnly(event.name)}
                        </div>
                        {event.durationMins && (
                          <span className={styles.durationPill}>
                            ⏱️ {formatDuration(event.durationMins)}
                          </span>
                        )}
                      </div>

                      <div className={styles.eventTrack}>
                        <span className={styles.trackDot}></span>
                        {event.track}
                      </div>
                      <div className={styles.trackConfig}>{event.trackConfig || ''}</div>

                      <div className={styles.racePills}>
                        {event.races.map((race) => (
                          <div key={race.id} className={styles.racePill}>
                            {new Date(race.startTime).toLocaleDateString('en-US', {
                              month: 'numeric',
                              day: 'numeric',
                            })}{' '}
                            •{' '}
                            {new Date(race.startTime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        ))}
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

                    <div className={styles.eventRight}>
                      <div
                        className={styles.licenseBadge}
                        title={`License ${license}`}
                        style={{
                          borderColor: getLicenseColor(license),
                          color: getLicenseColor(license),
                          backgroundColor: `${getLicenseColor(license)}30`,
                        }}
                      >
                        {license}
                      </div>
                      <div className={styles.driverPillContainer}>
                        <div className={styles.driverPill}>👥 {totalRegistrations}</div>
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
          teams={teams}
        />
      )}
    </>
  )
}
