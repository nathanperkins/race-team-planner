'use client'

import { useActionState, useState, useEffect, useRef, startTransition } from 'react'
import { updateRegistrationRaceTime } from '@/app/actions'
import { ChevronDown } from 'lucide-react'
import styles from './EditableRaceTime.module.css'
import FormattedDate from './FormattedDate'
import WarningDialog from './WarningDialog'

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
  variant = 'table',
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
  const [updateError, setUpdateError] = useState('')
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
    if (
      state.message &&
      pendingLabel &&
      state.timestamp &&
      state.timestamp !== lastProcessedTimestamp.current
    ) {
      lastProcessedTimestamp.current = state.timestamp
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOpen(false)

      if (state.message !== 'Success') {
        const prefix = `Failed to update to ${pendingLabel}: `
        setUpdateError(`${prefix}${state.message}`)
      }

      setPendingLabel(null)
    }
  }, [state, pendingLabel])

  const handleSelect = (raceId: string, startTime: Date) => {
    if (!registrationId) return

    const label = `${startTime.toLocaleDateString(undefined, dateOnlyFormat)} - ${startTime.toLocaleTimeString(
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
          <FormattedDate date={currentRaceStartTime} format={dateOnlyFormat} hideTimezone /> -{' '}
          <FormattedDate date={currentRaceStartTime} format={timeOnlyFormat} />
        </span>
      </div>
    )
  }

  return (
    <>
      <div className={containerClassName} ref={dropdownRef}>
        <button
          type="button"
          className={styles.editButton}
          onClick={() => setIsOpen(!isOpen)}
          disabled={isPending}
        >
          <FormattedDate date={currentRaceStartTime} format={dateOnlyFormat} hideTimezone /> -{' '}
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
                <FormattedDate date={race.startTime} format={dateOnlyFormat} hideTimezone /> -{' '}
                <FormattedDate date={race.startTime} format={timeOnlyFormat} />
              </button>
            ))}
          </div>
        )}
      </div>
      <WarningDialog
        isOpen={updateError.length > 0}
        title="Update Failed"
        message={updateError}
        onConfirm={() => setUpdateError('')}
        hideCancel
        confirmLabel="OK"
      />
    </>
  )
}
