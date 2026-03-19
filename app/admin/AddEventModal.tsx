'use client'

import { X } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'
import { createCustomEvent } from './actions'
import styles from './AddEventModal.module.css'
import LoadingOverlay from '@/components/LoadingOverlay'
import CustomEventFormFields from './CustomEventFormFields'

interface AddEventModalProps {
  onClose: () => void
}

export default function AddEventModal({ onClose }: AddEventModalProps) {
  const [state, formAction, pending] = useActionState(createCustomEvent, { message: '' })
  const [timeslots, setTimeslots] = useState<Array<{ id: string; startTime: string }>>([
    { id: '', startTime: '' },
  ])
  const modalRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Close on successful submission
  useEffect(() => {
    if (state.message === 'Success') {
      if (formRef.current) {
        formRef.current.reset()
      }
      setTimeout(() => onClose(), 500)
    }
  }, [state.message, onClose])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose()
    }
  }

  return (
    <>
      {pending && <LoadingOverlay message="Creating event..." />}
      <div className={styles.backdrop} ref={modalRef} onClick={handleBackdropClick}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <h2 className={styles.title}>Add Custom Event</h2>
            <button className={styles.closeButton} onClick={onClose} type="button">
              <X size={24} />
            </button>
          </div>

          <form action={formAction} className={styles.form} ref={formRef}>
            <CustomEventFormFields timeslots={timeslots} setTimeslots={setTimeslots} />

            {state.message && state.message !== 'Success' && (
              <div className={styles.error}>{state.message}</div>
            )}

            {state.message === 'Success' && (
              <div className={styles.success}>Event created successfully!</div>
            )}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.submitButton} disabled={pending}>
                {pending ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
