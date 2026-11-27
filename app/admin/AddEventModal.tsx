'use client'

import { X } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'
import { createCustomEvent } from './actions'
import styles from './AddEventModal.module.css'
import LoadingOverlay from '@/components/LoadingOverlay'
import WarningDialog from '@/components/WarningDialog'
import { useTimeZone } from '@/components/TimeZoneProvider'
import { DEFAULT_TIMEZONE, convertDateTimeLocalTimeZone } from '@/lib/timezone-utils'
import CustomEventFormFields from './CustomEventFormFields'
import { useUnsavedCustomEventGuard } from './useUnsavedCustomEventGuard'

interface AddEventModalProps {
  onClose: () => void
}

export default function AddEventModal({ onClose }: AddEventModalProps) {
  const [state, formAction, pending] = useActionState(createCustomEvent, { message: '' })
  const { localTimeZone } = useTimeZone()
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_TIMEZONE)
  const [timeslots, setTimeslots] = useState<Array<{ id: string; startTime: string }>>([
    { id: '', startTime: '' },
  ])
  const modalRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handleTimeZoneChange = (nextTimeZone: string) => {
    setTimeslots((prev) =>
      prev.map((ts) => ({
        ...ts,
        startTime: convertDateTimeLocalTimeZone(ts.startTime, timeZone, nextTimeZone),
      }))
    )
    setTimeZone(nextTimeZone)
  }

  // Close on successful submission
  useEffect(() => {
    if (state.message === 'Success') {
      if (formRef.current) {
        formRef.current.reset()
      }
      const timer = setTimeout(() => onClose(), 500)
      return () => clearTimeout(timer)
    }
  }, [state.message, onClose])

  const { confirmDiscardOpen, requestClose, confirmDiscard, cancelDiscard } =
    useUnsavedCustomEventGuard({
      formRef,
      timeslots,
      timeZone,
      onClose,
      isBusy: pending,
      isSaved: state.message === 'Success',
    })

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      requestClose()
    }
  }

  return (
    <>
      {pending && <LoadingOverlay message="Creating event..." />}
      <div className={styles.backdrop} ref={modalRef} onClick={handleBackdropClick}>
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-custom-event-title"
        >
          <div className={styles.header}>
            <h2 id="add-custom-event-title" className={styles.title}>
              Add Custom Event
            </h2>
            <button
              className={styles.closeButton}
              onClick={requestClose}
              type="button"
              aria-label="Close modal"
              disabled={pending}
            >
              <X size={24} />
            </button>
          </div>

          <form action={formAction} className={styles.form} ref={formRef}>
            <CustomEventFormFields
              timeslots={timeslots}
              setTimeslots={setTimeslots}
              timeZone={timeZone}
              onTimeZoneChange={handleTimeZoneChange}
              localTimeZone={localTimeZone}
            />

            {state.message && state.message !== 'Success' && (
              <div className={styles.error}>{state.message}</div>
            )}

            {state.message === 'Success' && (
              <div className={styles.success}>Event created successfully!</div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={requestClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button type="submit" className={styles.submitButton} disabled={pending}>
                {pending ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <WarningDialog
        isOpen={confirmDiscardOpen}
        title="Discard Unsaved Changes?"
        message="You have unsaved changes. Are you sure you want to close and discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        confirmTone="destructive"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  )
}
