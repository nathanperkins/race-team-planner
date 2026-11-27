'use client'

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { parseDateTimeInTimeZone } from '@/lib/timezone-utils'

const EXCLUDED_FORM_FIELDS = new Set(['timeZone', 'startTimes', 'raceIds', 'eventId'])

export interface CustomEventTimeslot {
  id: string
  startTime: string
}

/**
 * Serializes the custom event form's DOM fields and controlled timeslots into a
 * canonical snapshot string so dirty checks detect real edits without false
 * positives from reverting a field or switching the display timezone alone.
 */
export function serializeCustomEventFormState(
  form: HTMLFormElement | null,
  timeslots: CustomEventTimeslot[],
  timeZone: string
): string {
  const fields: Record<string, string[]> = {}
  if (form) {
    const formData = new FormData(form)
    const keys = Array.from(new Set(formData.keys()))
      .filter((key) => !EXCLUDED_FORM_FIELDS.has(key))
      .sort()
    for (const key of keys) {
      fields[key] = formData.getAll(key).map((val) => (typeof val === 'string' ? val : ''))
    }
  }

  const normalizedTimeslots = timeslots.map((ts) => {
    const trimmed = ts.startTime.trim()
    if (!trimmed) {
      return { id: ts.id, startTime: '' }
    }
    const parsed = parseDateTimeInTimeZone(trimmed, timeZone)
    return {
      id: ts.id,
      startTime: Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString(),
    }
  })

  return JSON.stringify({ fields, timeslots: normalizedTimeslots })
}

interface UseUnsavedCustomEventGuardOptions {
  formRef: RefObject<HTMLFormElement | null>
  timeslots: CustomEventTimeslot[]
  timeZone: string
  onClose: () => void
  /** Prevent close attempts while saving/deleting. */
  isBusy?: boolean
  /** Skip confirmation once save has already succeeded. */
  isSaved?: boolean
  /** True when another nested dialog (e.g. Delete Event) is open. */
  isOtherDialogOpen?: boolean
  /** Optional handler to dismiss the other nested dialog on Escape. */
  onOtherDialogEscape?: () => void
}

export function useUnsavedCustomEventGuard({
  formRef,
  timeslots,
  timeZone,
  onClose,
  isBusy = false,
  isSaved = false,
  isOtherDialogOpen = false,
  onOtherDialogEscape,
}: UseUnsavedCustomEventGuardOptions) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const initialSnapshotRef = useRef<string | null>(null)
  const initialTimeslotsRef = useRef(timeslots)
  const initialTimeZoneRef = useRef(timeZone)

  useEffect(() => {
    if (initialSnapshotRef.current === null && formRef.current) {
      initialSnapshotRef.current = serializeCustomEventFormState(
        formRef.current,
        initialTimeslotsRef.current,
        initialTimeZoneRef.current
      )
    }
  }, [formRef])

  const hasPendingChanges = useCallback(() => {
    if (isSaved || initialSnapshotRef.current === null || !formRef.current) {
      return false
    }
    const currentSnapshot = serializeCustomEventFormState(formRef.current, timeslots, timeZone)
    return currentSnapshot !== initialSnapshotRef.current
  }, [formRef, isSaved, timeslots, timeZone])

  const requestClose = useCallback(() => {
    if (isBusy) return
    if (hasPendingChanges()) {
      setConfirmDiscardOpen(true)
      return
    }
    onClose()
  }, [hasPendingChanges, isBusy, onClose])

  const confirmDiscard = useCallback(() => {
    setConfirmDiscardOpen(false)
    onClose()
  }, [onClose])

  const cancelDiscard = useCallback(() => {
    setConfirmDiscardOpen(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopPropagation()

      if (isOtherDialogOpen) {
        onOtherDialogEscape?.()
        return
      }
      if (confirmDiscardOpen) {
        setConfirmDiscardOpen(false)
        return
      }
      requestClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [confirmDiscardOpen, isOtherDialogOpen, onOtherDialogEscape, requestClose])

  return {
    confirmDiscardOpen,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  }
}
