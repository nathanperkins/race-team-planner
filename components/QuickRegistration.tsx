'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { registerForRace } from '@/app/actions'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import styles from './QuickRegistration.module.css'
import { isLicenseEligible, getLicenseForId, LicenseLevel } from '@/lib/utils'

interface Props {
  raceId: string
  carClasses: { id: string; name: string; shortName: string }[]
  compact?: boolean
  onDropdownToggle?: (open: boolean) => void
  eventId?: string
  eventLicenseGroup?: number | null
  userLicenseLevel?: LicenseLevel | null
}

type State = {
  message: string
  errors?: Record<string, string[]>
}

const initialState: State = {
  message: '',
}

export default function QuickRegistration({
  raceId,
  carClasses,
  compact = false,
  onDropdownToggle,
  eventId,
  eventLicenseGroup,
  userLicenseLevel,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down')
  const [state, formAction, isPending] = useActionState(registerForRace, initialState)
  const [showWarning, setShowWarning] = useState(false)
  const [pendingClassId, setPendingClassId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const computeOpenDirection = () => {
    const rect = dropdownRef.current?.getBoundingClientRect()
    if (!rect) return
    const threshold = 220
    const shouldOpenUp = rect.bottom > window.innerHeight - threshold
    setOpenDirection(shouldOpenUp ? 'up' : 'down')
  }

  useEffect(() => {
    onDropdownToggle?.(isOpen)
  }, [isOpen, onDropdownToggle])

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('resize', computeOpenDirection)
    window.addEventListener('scroll', computeOpenDirection, true)
    return () => {
      window.removeEventListener('resize', computeOpenDirection)
      window.removeEventListener('scroll', computeOpenDirection, true)
    }
  }, [isOpen])

  const checkEligibilityAndSubmit = (classId: string) => {
    if (formRef.current) {
      const input = formRef.current.querySelector('input[name="carClassId"]') as HTMLInputElement
      if (input) {
        input.value = classId
        formRef.current.requestSubmit()
      }
    }
  }

  const handleSelect = (classId: string) => {
    setIsOpen(false)

    // Check eligibility if we have the necessary information
    if (
      eventId &&
      eventLicenseGroup !== undefined &&
      eventLicenseGroup !== null &&
      userLicenseLevel !== null &&
      userLicenseLevel !== undefined
    ) {
      const eventLicense = getLicenseForId(eventId, eventLicenseGroup)
      const isEligible = isLicenseEligible(userLicenseLevel, eventLicense)

      if (!isEligible) {
        // User is ineligible - show warning
        setPendingClassId(classId)
        setShowWarning(true)
        return
      }
    }

    // User is eligible or we don't have enough info to check - proceed
    checkEligibilityAndSubmit(classId)
  }

  const handleCancelWarning = () => {
    setShowWarning(false)
    setPendingClassId(null)
  }

  const handleContinueRegistration = () => {
    setShowWarning(false)
    if (pendingClassId) {
      checkEligibilityAndSubmit(pendingClassId)
      setPendingClassId(null)
    }
  }

  return (
    <div className={compact ? styles.compactContainer : styles.container} ref={dropdownRef}>
      <form action={formAction} ref={formRef}>
        <input type="hidden" name="raceId" value={raceId} />
        <input type="hidden" name="carClassId" />
      </form>
      <div className={styles.dropdownWrapper}>
        <button
          type="button"
          className={styles.registerButton}
          onClick={() => {
            const next = !isOpen
            if (next) {
              computeOpenDirection()
            }
            setIsOpen(next)
          }}
          disabled={isPending}
        >
          {isPending ? 'Registering...' : 'Register'} <ChevronDown size={14} />
        </button>
        {isOpen && !isPending && (
          <div className={`${styles.dropdown} ${openDirection === 'up' ? styles.dropdownUp : ''}`}>
            <div className={styles.dropdownHeader}>Select Car Class</div>
            {carClasses.map((cc) => (
              <button
                key={cc.id}
                type="button"
                className={styles.dropdownItem}
                onClick={() => handleSelect(cc.id)}
              >
                {cc.shortName || cc.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {state?.message && state.message !== 'Success' && (
        <p className={styles.errorMessage}>{state.message}</p>
      )}

      {showWarning && (
        <div className={styles.warningOverlay} role="dialog" aria-modal="true">
          <div className={styles.warningDialog}>
            <div className={styles.warningHeader}>
              <AlertTriangle size={24} color="#f59e0b" />
              <h3>Ineligible for Race</h3>
            </div>
            <div className={styles.warningBody}>
              <p>
                You do not meet the license requirements for this race. You can still register, but
                you may not be eligible to participate in the official event.
              </p>
            </div>
            <div className={styles.warningActions}>
              <button
                type="button"
                className={styles.warningCancelButton}
                onClick={handleCancelWarning}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.warningContinueButton}
                onClick={handleContinueRegistration}
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
