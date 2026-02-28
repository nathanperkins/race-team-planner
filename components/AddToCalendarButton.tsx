'use client'

import { CalendarPlus, Chrome, Mail, Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  downloadIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildCalendarDescription,
  CalendarEventInput,
} from '@/lib/calendar-utils'
import styles from './AddToCalendarButton.module.css'

interface AddToCalendarButtonProps {
  raceId: string
  startTime: Date | string
  endTime: Date | string
  eventId: string
  eventName: string
  track: string
  trackConfig?: string | null
  discordTeamsThreadId?: string | null
  discordGuildId?: string
  appBaseUrl?: string
  durationMins?: number | null
  tempValue?: number | null
  tempUnits?: number | null
  relHumidity?: number | null
  carClasses?: Array<{ name: string; shortName?: string | null }>
  /**
   * When provided, rendered as the trigger button content instead of the
   * default CalendarPlus icon. Use to make an existing pill the trigger.
   */
  children?: ReactNode
  className?: string
}

export default function AddToCalendarButton({
  raceId,
  startTime,
  endTime,
  eventId,
  eventName,
  track,
  trackConfig,
  discordTeamsThreadId,
  discordGuildId,
  appBaseUrl,
  durationMins,
  tempValue,
  tempUnits,
  relHumidity,
  carClasses,
  children,
  className,
}: AddToCalendarButtonProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function buildEvent(): CalendarEventInput {
    const base = appBaseUrl ?? window.location.origin
    const appUrl = `${base}/events?eventId=${eventId}`
    const discordUrl =
      discordTeamsThreadId && discordGuildId
        ? `https://discord.com/channels/${discordGuildId}/${discordTeamsThreadId}`
        : null

    const start = new Date(startTime)
    const end = new Date(endTime)
    const description = buildCalendarDescription({
      eventName,
      track,
      trackConfig,
      startTime: start,
      endTime: end,
      durationMins,
      tempValue,
      tempUnits,
      relHumidity,
      carClasses,
      appUrl,
      discordUrl,
    })

    return {
      uid: raceId,
      title: `${eventName} @ ${track}`,
      location: trackConfig ? `${track} - ${trackConfig}` : track,
      startTime: start,
      endTime: end,
      description,
    }
  }

  function handleGoogle() {
    window.open(buildGoogleCalendarUrl(buildEvent()), '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  function handleOutlook() {
    window.open(buildOutlookCalendarUrl(buildEvent()), '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  function handleIcs() {
    const event = buildEvent()
    const safeTitle = event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    downloadIcs(event, `${safeTitle}.ics`)
    setOpen(false)
  }

  const triggerClass = children
    ? `${styles.pillTrigger}${className ? ` ${className}` : ''}`
    : `${styles.calendarButton}${className ? ` ${className}` : ''}`

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        title="Add to calendar"
        aria-label="Add to calendar"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {children ?? <CalendarPlus size={14} />}
      </button>

      {open && (
        <div className={styles.dropdown} role="menu">
          <button type="button" role="menuitem" className={styles.menuItem} onClick={handleGoogle}>
            <Chrome size={14} /> Google Calendar
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={handleOutlook}>
            <Mail size={14} /> Outlook
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={handleIcs}>
            <Download size={14} /> Apple / iCal (.ics)
          </button>
        </div>
      )}
    </div>
  )
}
