'use client'

import { useActionState, useState, useEffect, useRef, startTransition } from 'react'
import { updateRegistrationRaceTime } from '@/app/actions'
import { ChevronDown } from 'lucide-react'
import styles from './EditableRaceTime.module.css'
import FormattedDate from './FormattedDate'

interface Props {
  registrationId?: string
  currentRaceId: string
  currentRaceStartTime: Date
  availableRaces?: { id: string; startTime: Date }[]
  readOnly?: boolean
  variant?: 'standard' | 'table'
}

type State = {
  message: string
  errors?: Record<string, string[]>
  timestamp: number
}

const initialState: State = {
  message: '',
  timestamp: 0,
}

export default function EditableRaceTime({
  registrationId,
  currentRaceId,
  currentRaceStartTime,
  availableRaces,
  readOnly = false,
  variant = 'table', // Default to table since it was the original use case
}: Props) {
  const dateOnlyFormat: Intl.DateTimeFormatOptions = {
    month: 'numeric',
    day: 'numeric',
  }

  const timeOnlyFormat: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  const [isOpen, setIsOpen] = useState(false)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [state, formAction, isPending] = useActionState(updateRegistrationRaceTime, initialState)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const lastProcessedTimestamp = useRef<number>(0)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    // Only process if we have a state message, a pending action was initiated (pendingLabel),
    // and this state update hasn't been processed yet.
    // Note: older messages might not have timestamp, but new ones will.
    if (
      state.message &&
      pendingLabel &&
      state.timestamp &&
      state.timestamp !== lastProcessedTimestamp.current
    ) {
      // Mark as processed
      lastProcessedTimestamp.current = state.timestamp

      // Always close dropdown when a message (success or error) is received
      // Always close dropdown when a message (success or error) is received
      // eslint-disable-next-line
      setIsOpen(false)

      if (state.message !== 'Success') {
        const prefix = `Failed to update to ${pendingLabel}: `
        alert(`${prefix}${state.message}`)
      }

      // Clear pending label after handling
      setPendingLabel(null)
    }
  }, [state, pendingLabel])

  const handleSelect = (raceId: string, startTime: Date) => {
    if (!registrationId) return

    // Create a readable label for the alert
    const label = `${startTime.toLocaleDateString(undefined, dateOnlyFormat)} • ${startTime.toLocaleTimeString(
      undefined,
      {
        ...timeOnlyFormat,
        hour12: true,
        timeZoneName: 'short',
      }
    )}`
    setPendingLabel(label)

    const formData = new FormData()
    formData.append('registrationId', registrationId)
    formData.append('raceId', raceId)
    startTransition(() => {
      formAction(formData)
    })
  }

  const containerClassName = `${styles.container} ${variant === 'standard' ? styles.standardVariant : ''}`

  if (readOnly || !registrationId || !availableRaces || availableRaces.length <= 1) {
    return (
      <div className={containerClassName}>
        <span className={styles.displayOnly}>
          <FormattedDate date={currentRaceStartTime} format={dateOnlyFormat} hideTimezone /> •{' '}
          <FormattedDate date={currentRaceStartTime} format={timeOnlyFormat} />
        </span>
      </div>
    )
  }

  return (
    <div className={containerClassName} ref={dropdownRef}>
      <button
        type="button"
        className={styles.editButton}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
      >
        <FormattedDate date={currentRaceStartTime} format={dateOnlyFormat} hideTimezone /> •{' '}
        <FormattedDate date={currentRaceStartTime} format={timeOnlyFormat} />{' '}
        <ChevronDown size={12} className={styles.chevron} />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {availableRaces.map((race) => (
            <button
              key={race.id}
              type="button"
              className={`${styles.dropdownItem} ${race.id === currentRaceId ? styles.active : ''}`}
              onClick={() => handleSelect(race.id, race.startTime)}
              disabled={isPending}
            >
              <FormattedDate date={race.startTime} format={dateOnlyFormat} hideTimezone /> •{' '}
              <FormattedDate date={race.startTime} format={timeOnlyFormat} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
