'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
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
  const [updateError, setUpdateError] = useState('')
  const [isPending, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (raceId: string, startTime: Date) => {
    if (!registrationId) return
    setIsOpen(false)

    const label = `${startTime.toLocaleDateString(undefined, dateOnlyFormat)} - ${startTime.toLocaleTimeString(
      undefined,
      {
        ...timeOnlyFormat,
        hour12: true,
        timeZoneName: 'short',
      }
    )}`

    const formData = new FormData()
    formData.append('registrationId', registrationId)
    formData.append('raceId', raceId)
    startTransition(async () => {
      try {
        const result = await updateRegistrationRaceTime(initialState, formData)
        if (result.message && result.message !== 'Success') {
          const prefix = `Failed to update to ${label}: `
          setUpdateError(`${prefix}${result.message}`)
        }
      } catch (err) {
        const prefix = `Failed to update to ${label}: `
        setUpdateError(`${prefix}${err instanceof Error ? err.message : 'Unknown error'}`)
      }
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
