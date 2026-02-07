'use client'

import {
  X,
  Cloud,
  ShieldCheck,
  ShieldX,
  Thermometer,
  Droplets,
  Timer,
  MapPin,
  Calendar,
  Car,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import RaceDetails from '@/components/RaceDetails'
import EditEventButton from '@/app/admin/EditEventButton'
import {
  getLicenseForId,
  getLicenseColor,
  formatDuration,
  getSeriesNameOnly,
  getLicenseLevelFromName,
  LicenseLevel,
} from '@/lib/utils'
import { Prisma } from '@prisma/client'
import styles from './EventDetailModal.module.css'

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

interface Driver {
  id: string
  name: string | null
  image: string | null
}

interface EventDetailModalProps {
  event: EventWithRaces
  onClose: () => void
  isAdmin: boolean
  userId: string
  userLicenseLevel: LicenseLevel | null
  teams: Array<{ id: string; name: string }>
}

export default function EventDetailModal({
  event,
  onClose,
  isAdmin,
  userId,
  userLicenseLevel,
  teams,
}: EventDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [allDrivers, setAllDrivers] = useState<Driver[]>([])

  const license = getLicenseForId(event.id, event.licenseGroup)
  const licenseColor = getLicenseColor(license)
  const requiredLicenseLevel = getLicenseLevelFromName(license)
  const isEligible =
    requiredLicenseLevel === null
      ? true
      : userLicenseLevel !== null && userLicenseLevel >= requiredLicenseLevel

  // Fetch all drivers for admin search
  useEffect(() => {
    if (isAdmin) {
      fetch('/api/drivers')
        .then((res) => res.json())
        .then((data) => setAllDrivers(data))
        .catch((err) => console.error('Failed to fetch drivers:', err))
    }
  }, [isAdmin])

  // Calculate ISO week number
  const getWeekNumber = (date: Date): number => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    return weekNum
  }

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose()
    }
  }

  return (
    <div className={styles.backdrop} ref={modalRef} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            {event.externalId && (
              <span className={styles.badge}>
                <Cloud size={14} /> Synced
              </span>
            )}
            <span className={styles.eventMetaHeader}>
              {new Date(event.startTime).getFullYear()} • Season{' '}
              {Math.floor(new Date(event.startTime).getMonth() / 3) + 1} • Week{' '}
              {getWeekNumber(event.startTime)}
            </span>
            {isAdmin && !event.externalId && (
              <EditEventButton
                event={{
                  id: event.id,
                  name: event.name,
                  track: event.track,
                  trackConfig: event.trackConfig,
                  description: event.description,
                  startTime: event.startTime,
                  endTime: event.endTime,
                  durationMins: event.durationMins,
                  licenseGroup: event.licenseGroup,
                  tempValue: event.tempValue,
                  tempUnits: event.tempUnits,
                  relHumidity: event.relHumidity,
                  skies: event.skies,
                  precipChance: event.precipChance,
                  carClasses: event.carClasses,
                }}
              />
            )}
          </div>
          <button className={styles.closeButton} onClick={onClose} type="button">
            <X size={24} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.titleRow}>
            <div>
              <div className={styles.titleWithBadge}>
                <h1 className={styles.eventTitle}>{getSeriesNameOnly(event.name)}</h1>
                <div
                  className={styles.licenseBadgeInline}
                  style={{
                    borderColor: licenseColor,
                    color: licenseColor,
                    backgroundColor: `${licenseColor}30`,
                  }}
                >
                  {isEligible ? <ShieldCheck size={18} /> : <ShieldX size={18} color="#ef4444" />}
                  {license}
                </div>
              </div>
              <div className={styles.trackName}>
                <MapPin size={16} /> {event.track}
                {event.trackConfig && ` - ${event.trackConfig}`}
              </div>
            </div>
          </div>

          <div className={styles.carClassList}>
            {event.races.map((race, idx) => (
              <span key={race.id} className={styles.carClassTag}>
                <Calendar size={14} />{' '}
                {new Date(race.startTime).toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                })}{' '}
                •{' '}
                {new Date(race.startTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZoneName: idx === event.races.length - 1 ? 'short' : undefined,
                })}
              </span>
            ))}
          </div>

          {event.carClasses.length > 0 && (
            <div className={styles.carClassSection}>
              <div className={styles.carClassList}>
                {event.carClasses.map((cc) => (
                  <span key={cc.id} className={styles.carClassTag}>
                    <Car size={14} /> {cc.shortName || cc.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats Bar */}
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

            {event.tempValue !== null && (
              <div className={styles.statsItem}>
                <Thermometer size={18} className={styles.statsIcon} />
                <div>
                  <span className={styles.statsLabel}>Temp</span>
                  <span className={styles.statsValue}>
                    {event.tempValue}°{event.tempUnits || 'F'}
                  </span>
                </div>
              </div>
            )}

            {event.relHumidity !== null && (
              <div className={styles.statsItem}>
                <Droplets size={18} className={styles.statsIcon} />
                <div>
                  <span className={styles.statsLabel}>Humidity</span>
                  <span className={styles.statsValue}>{event.relHumidity}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Race Sessions */}
          <div className={styles.racesSection}>
            {event.races.map((race) => (
              <RaceDetails
                key={race.id}
                race={race}
                userId={userId}
                isAdmin={isAdmin}
                allDrivers={allDrivers}
                teams={teams}
                carClasses={event.carClasses.map((cc) => ({
                  id: cc.id,
                  name: cc.name,
                  shortName: cc.shortName,
                }))}
              />
            ))}
          </div>

          {event.description && (
            <p className={styles.description}>
              {event.description
                .split('\n')
                .filter((line) => !line.toLowerCase().includes('races') && !line.includes('GMT'))
                .join('\n')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
