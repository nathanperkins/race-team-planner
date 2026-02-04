'use client'

import { useActionState, useState, useEffect, useRef, startTransition } from 'react'
import { updateRegistrationCarClass } from '@/app/actions'
import { ChevronDown } from 'lucide-react'
import styles from './EditableCarClass.module.css'

interface Props {
  registrationId?: string
  currentCarClassId: string
  currentCarClassShortName: string
  carClasses?: { id: string; name: string; shortName: string }[]
  readOnly?: boolean
  showLabel?: boolean
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

export default function EditableCarClass({
  registrationId,
  currentCarClassId,
  currentCarClassShortName,
  carClasses,
  readOnly = false,
  showLabel = true,
  variant = 'standard',
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [state, formAction, isPending] = useActionState(updateRegistrationCarClass, initialState)
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
    if (
      state.message &&
      pendingLabel &&
      state.timestamp &&
      state.timestamp !== lastProcessedTimestamp.current
    ) {
      // Mark as processed
      lastProcessedTimestamp.current = state.timestamp

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

  const handleSelect = (classId: string, label: string) => {
    if (!registrationId) return
    setPendingLabel(label)
    const formData = new FormData()
    formData.append('registrationId', registrationId)
    formData.append('carClassId', classId)
    startTransition(() => {
      formAction(formData)
    })
  }

  const displayText = showLabel ? `Class: ${currentCarClassShortName}` : currentCarClassShortName
  const containerClassName = `${styles.container} ${variant === 'table' ? styles.tableVariant : ''}`

  if (readOnly || !registrationId || !carClasses) {
    return (
      <div className={containerClassName}>
        <p className={styles.displayOnly}>{displayText}</p>
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
        {displayText} <ChevronDown size={12} className={styles.chevron} />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {carClasses.map((cc) => (
            <button
              key={cc.id}
              type="button"
              className={`${styles.dropdownItem} ${cc.id === currentCarClassId ? styles.active : ''}`}
              onClick={() => handleSelect(cc.id, cc.shortName)}
              disabled={isPending}
            >
              {cc.name} ({cc.shortName})
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
