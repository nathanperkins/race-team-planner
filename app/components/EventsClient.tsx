'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import EventDetailModal from './EventDetailModal'
import { Prisma } from '@prisma/client'
import styles from '../events/events.module.css'
import {
  getLicenseBadgeInfo,
  formatDuration,
  getSeriesNameOnly,
  isLicenseEligible,
  LicenseLevel,
} from '@/lib/utils'
import type { CSSProperties } from 'react'
import { Check, Globe, ShieldCheck, ShieldX, Timer, User } from 'lucide-react'
import { useTimeZone } from '@/components/TimeZoneProvider'
import { formatRaceDateTime } from '@/lib/timezone-utils'

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
  isOnIracingTeam?: boolean
  teams: Array<{
    id: string
    name: string
    iracingTeamId: number | null
    memberCount?: number
    memberCustomerIds?: number[]
  }>
  discordGuildId?: string
  selectedEvent?: EventWithRaces | null
}

export default function EventsClient({
  weeks,
  isAdmin,
  userId,
  userLicenseLevel,
  isOnIracingTeam,
  teams,
  discordGuildId,
  selectedEvent,
}: EventsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { timeZone } = useTimeZone()
  // Captured once at render. On a long-lived page, time-based flags (isLive,
  // isRaceStarted) can go stale. Acceptable for now; a useNow() hook could
  // refresh on an interval if accuracy becomes important.
  const now = new Date()

  // Show modal immediately on click without waiting for the RSC round-trip
  const [optimisticEvent, setOptimisticEvent] = useState<EventWithRaces | null>(null)

  // Reset optimistic state when the server confirms no event is selected (e.g. browser back button).
  // Done during render (not an effect) to keep the state machine consistent.
  const [prevSelectedEvent, setPrevSelectedEvent] = useState(selectedEvent)
  if (prevSelectedEvent !== selectedEvent) {
    setPrevSelectedEvent(selectedEvent)
    if (!selectedEvent) setOptimisticEvent(null)
  }

  const displayEvent = selectedEvent ?? optimisticEvent
  const displayEventId = displayEvent?.id

  useEffect(() => {
    if (!displayEventId) return

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [displayEventId])

  // Update URL when event is selected; show modal immediately via optimistic state
  const handleSelectEvent = (event: EventWithRaces) => {
    setOptimisticEvent(event)
    const params = new URLSearchParams(searchParams.toString())
    params.set('eventId', event.id)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  // Clear URL when modal is closed, preserving other active filter params
  const handleCloseModal = () => {
    setOptimisticEvent(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('eventId')
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      <div className={styles.weekGrid}>
        {weeks.map((week, idx) => (
          <div
            key={`S${week.seasonYear}-Q${week.seasonQuarter}-W${week.weekNumber}`}
            className={`${styles.weekTile} ${idx % 2 === 1 ? styles.alt : ''}`}
          >
            <div className={styles.weekHeader}>
              <div className={styles.weekTitle}>
                <div className={styles.wk}>
                  {`${week.seasonYear} - Season ${week.seasonQuarter} - Week ${week.weekNumber}`}
                </div>
                <div className={styles.range} suppressHydrationWarning>
                  {week.weekStart.toLocaleDateString('en-US', {
                    timeZone: 'UTC',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  –{' '}
                  {week.weekEnd.toLocaleDateString('en-US', {
                    timeZone: 'UTC',
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
                const licenseBadge = getLicenseBadgeInfo(event.licenseGroup)
                const isEligible = isLicenseEligible(userLicenseLevel, licenseBadge.license)
                const lastRaceEnd = event.races.reduce<Date | null>((latest, race) => {
                  const end = new Date(race.endTime)
                  if (!latest || end > latest) return end
                  return latest
                }, null)
                const liveRaces = event.races.filter((race) => {
                  const start = new Date(race.startTime)
                  const end = new Date(race.endTime)
                  return now >= start && now <= end
                })
                const isLive = liveRaces.length > 0
                const hasLiveCommunityRacer = liveRaces.some(
                  (race) => race.registrations.length > 0
                )
                const isCompleted = lastRaceEnd ? now > lastRaceEnd : now > new Date(event.endTime)
                const isUserRegistered = event.races.some((race) =>
                  race.registrations.some((reg) => reg.userId === userId)
                )
                const totalDrivers = event.races.reduce(
                  (sum, race) => sum + race.registrations.length,
                  0
                )
                const licenseStyle: LicenseStyle = {
                  ['--licColor']: licenseBadge.color,
                }
                const badgeStyle = {
                  borderColor: licenseBadge.color,
                  color: licenseBadge.color,
                  backgroundColor: `${licenseBadge.color}30`,
                }

                const eventRight = (variant: 'mobile' | 'desktop') => {
                  const tooltip = variant === 'desktop' ? 'instant-tooltip ' : ''
                  const variantClass =
                    variant === 'mobile' ? styles.eventRightMobile : styles.eventRightDesktop
                  return (
                    <div className={`${styles.eventRight} ${variantClass}`}>
                      <div className={styles.eventRightTop}>
                        {isLive && (
                          <div
                            className={`${tooltip}${styles.liveBadge}${
                              !hasLiveCommunityRacer ? ` ${styles.liveBadgeMuted}` : ''
                            }`}
                            title={
                              hasLiveCommunityRacer
                                ? 'Community racers are currently racing in this event'
                                : 'Live now — no community racers registered in the active timeslot'
                            }
                          >
                            <span
                              className={`${styles.liveDot}${
                                !hasLiveCommunityRacer ? ` ${styles.liveDotMuted}` : ''
                              }`}
                            />
                            LIVE
                          </div>
                        )}
                        {isUserRegistered && (
                          <span
                            className={`${tooltip}${styles.registeredBadge}`}
                            role="status"
                            aria-label="You are registered for this event"
                            title="You are registered for this event"
                          >
                            <Check size={14} />
                            Registered
                          </span>
                        )}
                        <div
                          className={`${tooltip}${styles.licenseBadge}`}
                          title={
                            licenseBadge.isOpenToAll
                              ? 'No license requirement — open to all drivers'
                              : !isEligible
                                ? 'You do not meet the license requirements for this event'
                                : 'You are eligible for this event'
                          }
                          style={badgeStyle}
                        >
                          {licenseBadge.isOpenToAll ? (
                            <Globe size={14} />
                          ) : isEligible ? (
                            <ShieldCheck size={14} />
                          ) : (
                            <ShieldX size={14} color="#ef4444" />
                          )}
                          {licenseBadge.label}
                        </div>
                      </div>
                      <div className={styles.driverPill}>
                        <User size={12} className={styles.driverIcon} />
                        {totalDrivers}
                      </div>
                    </div>
                  )
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
                      {eventRight('mobile')}

                      <div className={styles.racePills}>
                        {event.races.map((race) => {
                          const raceStart = new Date(race.startTime)
                          const raceEnd = new Date(race.endTime)
                          const isRaceCompleted = now > raceEnd
                          const isRaceLive = now >= raceStart && now <= raceEnd
                          const isRaceLiveMuted = isRaceLive && race.registrations.length === 0
                          return (
                            <div
                              key={race.id}
                              className={`${styles.racePill} ${
                                isRaceCompleted
                                  ? styles.racePillCompleted
                                  : isRaceLive
                                    ? `${styles.racePillLive}${
                                        isRaceLiveMuted ? ` ${styles.racePillLiveMuted}` : ''
                                      }`
                                    : ''
                              }`}
                            >
                              <span suppressHydrationWarning>
                                {formatRaceDateTime(raceStart, timeZone)}
                              </span>
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

                    {eventRight('desktop')}
                  </button>
                )
              })}
            </div>

            <div className={styles.tipText}>Tip: click an event row to view details</div>
          </div>
        ))}
      </div>

      {displayEvent && (
        <EventDetailModal
          event={displayEvent}
          onClose={handleCloseModal}
          isAdmin={isAdmin}
          userId={userId}
          userLicenseLevel={userLicenseLevel}
          isOnIracingTeam={isOnIracingTeam}
          teams={teams}
          discordGuildId={discordGuildId}
        />
      )}
    </>
  )
}
