'use client'

import { X, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'
import { updateCustomEvent, deleteCustomEvent } from './actions'
import styles from './AddEventModal.module.css'
import LoadingOverlay from '@/components/LoadingOverlay'
import WarningDialog from '@/components/WarningDialog'
import CustomEventFormFields from './CustomEventFormFields'
import { CustomEventData } from './customEventSchema'

interface EditEventModalProps {
  onClose: () => void
  event: CustomEventData
}

export default function EditEventModal({ onClose, event }: EditEventModalProps) {
  const [state, formAction, pending] = useActionState(updateCustomEvent, { message: '' })
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  // Close on successful submission
  useEffect(() => {
    if (state.message === 'Success') {
      setTimeout(() => onClose(), 500)
    }
  }, [state.message, onClose])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onClose()
    }
  }

  // Format datetime-local string
  const formatDateForInput = (date: Date | string) => {
    if (!date) return ''
    const d = new Date(date)
    // Adjust to local ISO string (YYYY-MM-DDTHH:mm)
    // This is a fast way to get local time into the input
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60 * 1000)
    return local.toISOString().slice(0, 16)
  }

  const [timeslots, setTimeslots] = useState<Array<{ id: string; startTime: string }>>(() => {
    if (event.races && event.races.length > 0) {
      return event.races.map((r) => ({ id: r.id, startTime: formatDateForInput(r.startTime) }))
    }
    return [{ id: '', startTime: formatDateForInput(event.startTime || '') }]
  })

  const handleDelete = async () => {
    setConfirmDeleteOpen(false)
    setIsDeleting(true)
    setDeleteError('')

    const result = await deleteCustomEvent(event.id!)

    if (result.success) {
      onClose()
    } else {
      setDeleteError(result.message)
      setIsDeleting(false)
    }
  }

  return (
    <>
      {(pending || isDeleting) && (
        <LoadingOverlay message={isDeleting ? 'Deleting event...' : 'Updating event...'} />
      )}
      <div className={styles.backdrop} ref={modalRef} onClick={handleBackdropClick}>
        <div className={styles.modal}>
          <div className={styles.header}>
            <h2 className={styles.title}>Edit Custom Event</h2>
            <button className={styles.closeButton} onClick={onClose} type="button">
              <X size={24} />
            </button>
          </div>

          <form action={formAction} className={styles.form}>
            <input type="hidden" name="eventId" value={event.id} />

            <CustomEventFormFields
              event={event}
              timeslots={timeslots}
              setTimeslots={setTimeslots}
            />

            {state.message && state.message !== 'Success' && (
              <div className={styles.error}>{state.message}</div>
            )}

            {deleteError && <div className={styles.error}>{deleteError}</div>}

            {state.message === 'Success' && (
              <div className={styles.success}>Event updated successfully!</div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={isDeleting || pending}
              >
                <Trash2 size={16} />
                {isDeleting ? 'Deleting...' : 'Delete Event'}
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={pending || isDeleting}
              >
                {pending ? 'Updating...' : 'Update Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <WarningDialog
        isOpen={confirmDeleteOpen}
        title="Delete Event?"
        message="Are you sure you want to delete this event? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  )
}
