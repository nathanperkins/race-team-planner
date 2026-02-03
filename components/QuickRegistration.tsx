'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { registerForRace } from '@/app/actions'
import { ChevronDown } from 'lucide-react'
import styles from './QuickRegistration.module.css'

interface Props {
  raceId: string
  carClasses: { id: string; name: string; shortName: string }[]
}

type State = {
  message: string
  errors?: Record<string, string[]>
}

const initialState: State = {
  message: '',
}

export default function QuickRegistration({ raceId, carClasses }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [state, formAction, isPending] = useActionState(registerForRace, initialState)
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

  const handleSelect = (classId: string) => {
    setSelectedClassId(classId)
    setIsOpen(false)
  }

  const selectedClassName = carClasses.find((c) => c.id === selectedClassId)?.shortName

  return (
    <div className={styles.container} ref={dropdownRef}>
      {!selectedClassId ? (
        <div className={styles.dropdownWrapper}>
          <button
            type="button"
            className={styles.registerButton}
            onClick={() => setIsOpen(!isOpen)}
            disabled={isPending}
          >
            Register <ChevronDown size={14} />
          </button>
          {isOpen && (
            <div className={styles.dropdown}>
              {carClasses.map((cc) => (
                <button
                  key={cc.id}
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => handleSelect(cc.id)}
                >
                  {cc.name} ({cc.shortName})
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form action={formAction} className={styles.confirmWrapper}>
          <input type="hidden" name="raceId" value={raceId} />
          <input type="hidden" name="carClassId" value={selectedClassId} />
          <div className={styles.confirmInfo}>
            <span className={styles.selectedLabel}>Class: {selectedClassName}</span>
            <button
              type="button"
              className={styles.changeButton}
              onClick={() => {
                setSelectedClassId(null)
                setIsOpen(true)
              }}
              disabled={isPending}
            >
              Change
            </button>
          </div>
          <button type="submit" className={styles.confirmButton} disabled={isPending}>
            {isPending ? 'Confirming...' : 'Confirm Registration'}
          </button>
        </form>
      )}
      {state.message && state.message !== 'Success' && (
        <p className={styles.errorMessage}>{state.message}</p>
      )}
    </div>
  )
}
