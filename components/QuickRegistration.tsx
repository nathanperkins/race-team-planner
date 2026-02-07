'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { registerForRace } from '@/app/actions'
import { ChevronDown } from 'lucide-react'
import styles from './QuickRegistration.module.css'

interface Props {
  raceId: string
  carClasses: { id: string; name: string; shortName: string }[]
  compact?: boolean
  onDropdownToggle?: (open: boolean) => void
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
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down')
  const [state, formAction, isPending] = useActionState(registerForRace, initialState)
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

  const handleSelect = (classId: string) => {
    setIsOpen(false)
    if (formRef.current) {
      // Set the value of the hidden input
      const input = formRef.current.querySelector('input[name="carClassId"]') as HTMLInputElement
      if (input) {
        input.value = classId
        formRef.current.requestSubmit()
      }
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

      {state.message && state.message !== 'Success' && (
        <p className={styles.errorMessage}>{state.message}</p>
      )}
    </div>
  )
}
