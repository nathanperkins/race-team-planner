'use client'

import { useActionState, useState, useEffect, useRef, startTransition } from 'react'
import { updateRegistrationCarClass } from '@/app/actions'
import { Car, ChevronDown } from 'lucide-react'
import styles from './EditableCarClass.module.css'

interface Props {
  registrationId?: string
  currentCarClassId: string
  currentCarClassShortName: string
  carClasses?: { id: string; name: string; shortName: string }[]
  readOnly?: boolean
  showLabel?: boolean
  variant?: 'standard' | 'table' | 'pill'
  deferSubmit?: boolean
  onChange?: (classId: string) => void
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
  deferSubmit = false,
  onChange,
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
    if (deferSubmit) {
      setIsOpen(false)
      onChange?.(classId)
      return
    }
    setPendingLabel(label)
    const formData = new FormData()
    formData.append('registrationId', registrationId)
    formData.append('carClassId', classId)
    startTransition(() => {
      formAction(formData)
    })
  }

  const displayText = showLabel ? `Class: ${currentCarClassShortName}` : currentCarClassShortName
  const containerClassName = [
    styles.container,
    variant === 'table' ? styles.tableVariant : '',
    variant === 'pill' ? styles.pillVariant : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (readOnly || !registrationId || !carClasses) {
    return (
      <div className={containerClassName}>
        <p className={styles.displayOnly}>
          {variant === 'pill' && <Car size={12} />}
          <span className={styles.pillText}>{displayText}</span>
        </p>
      </div>
    )
  }

  return (
    <div className={containerClassName} ref={dropdownRef}>
      <button
        type="button"
        className={`${styles.editButton} ${isOpen ? styles.active : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
      >
        {variant === 'pill' && <Car size={12} />}
        <span className={styles.pillText}>{displayText}</span>
        <ChevronDown size={12} className={styles.chevron} />
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
