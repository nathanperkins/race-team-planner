'use client'

import { useActionState, useState, useEffect, useRef, startTransition, useCallback } from 'react'
import { updateRegistrationCarClass } from '@/app/actions'
import { Car, ChevronDown } from 'lucide-react'
import styles from './EditableCarClass.module.css'

interface Props {
  registrationId?: string
  currentCarClassId: string
  currentCarClassShortName: string
  placeholderLabel?: string
  carClasses?: { id: string; name: string; shortName: string }[]
  className?: string
  readOnly?: boolean
  showLabel?: boolean
  variant?: 'standard' | 'table' | 'pill' | 'icon'
  pillStyle?: 'default' | 'group'
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
  placeholderLabel,
  carClasses,
  className,
  readOnly = false,
  showLabel = true,
  variant = 'standard',
  pillStyle = 'default',
  deferSubmit = false,
  onChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPlacement, setDropdownPlacement] = useState<'up' | 'down'>('down')
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState<number | undefined>(undefined)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [state, formAction, isPending] = useActionState(updateRegistrationCarClass, initialState)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownMenuRef = useRef<HTMLDivElement>(null)
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

  const updateDropdownPlacement = useCallback(() => {
    const container = dropdownRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const desiredHeight = 300
    const shouldFlip = spaceBelow < 160 && spaceAbove > spaceBelow
    setDropdownPlacement(shouldFlip ? 'up' : 'down')
    const available = shouldFlip ? spaceAbove - 12 : spaceBelow - 12
    if (available > 120) {
      setDropdownMaxHeight(Math.min(desiredHeight, available))
    } else {
      setDropdownMaxHeight(desiredHeight)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (!isOpen) return
      requestAnimationFrame(updateDropdownPlacement)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, updateDropdownPlacement])

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
    onChange?.(classId)
    setPendingLabel(label)
    const formData = new FormData()
    formData.append('registrationId', registrationId)
    formData.append('carClassId', classId)
    startTransition(() => {
      formAction(formData)
    })
  }

  const baseLabel = currentCarClassId ? currentCarClassShortName : (placeholderLabel ?? '-')
  const displayText = showLabel ? `Class: ${baseLabel}` : baseLabel
  const isPlaceholder = !currentCarClassId
  const containerClassName = [
    styles.container,
    variant === 'table' ? styles.tableVariant : '',
    variant === 'pill' ? styles.pillVariant : '',
    variant === 'icon' ? styles.iconVariant : '',
    variant === 'pill' && pillStyle === 'group' ? styles.groupPill : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if (readOnly || !registrationId || !carClasses) {
    return (
      <div className={containerClassName}>
        <p className={styles.displayOnly}>
          {(variant === 'pill' || variant === 'icon') && <Car size={12} />}
          {variant !== 'icon' && <span className={styles.pillText}>{displayText}</span>}
        </p>
      </div>
    )
  }

  return (
    <div className={containerClassName} ref={dropdownRef}>
      <button
        type="button"
        className={`${styles.editButton} ${isOpen ? styles.active : ''} ${
          isPlaceholder ? styles.placeholder : ''
        }`}
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev
            if (next) {
              requestAnimationFrame(updateDropdownPlacement)
            }
            return next
          })
        }}
        disabled={isPending}
        title={displayText}
        data-placeholder={isPlaceholder ? baseLabel : ''}
      >
        {(variant === 'pill' || variant === 'icon') && <Car size={12} />}
        {variant !== 'icon' && <span className={styles.pillText}>{displayText}</span>}
        {variant !== 'icon' && <ChevronDown size={12} className={styles.chevron} />}
      </button>

      {isOpen && (
        <div
          className={`${styles.dropdown} ${dropdownPlacement === 'up' ? styles.dropdownUp : ''}`}
          style={dropdownMaxHeight ? { maxHeight: `${dropdownMaxHeight}px` } : undefined}
          ref={dropdownMenuRef}
        >
          {carClasses.map((cc) => {
            const label = cc.name === cc.shortName ? cc.name : `${cc.name} (${cc.shortName})`
            return (
              <button
                key={cc.id}
                type="button"
                className={`${styles.dropdownItem} ${
                  cc.id === currentCarClassId ? styles.active : ''
                }`}
                onClick={() => handleSelect(cc.id, cc.shortName)}
                disabled={isPending}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
