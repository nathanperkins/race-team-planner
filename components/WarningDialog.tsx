'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import styles from './WarningDialog.module.css'

interface WarningDialogProps {
  isOpen: boolean
  title: string
  message: ReactNode
  onConfirm: () => void
  onCancel?: () => void
  confirmLabel?: string
  cancelLabel?: string
  hideCancel?: boolean
  confirmTone?: 'default' | 'destructive'
}

export default function WarningDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  hideCancel = false,
  confirmTone = 'default',
}: WarningDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const target = !hideCancel ? cancelButtonRef.current : confirmButtonRef.current
    target?.focus()

    return () => {
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [isOpen, hideCancel])

  if (!isOpen) return null

  const cancelClassName =
    confirmTone === 'destructive' ? styles.warningNeutral : styles.warningCancel
  const confirmClassName =
    confirmTone === 'destructive' ? styles.warningDestructive : styles.warningConfirm

  return (
    <div
      className={styles.warningModalOverlay}
      onClick={hideCancel ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={styles.warningModal} onClick={(e) => e.stopPropagation()}>
        <h4 className={styles.warningModalTitle}>{title}</h4>
        <div className={styles.warningModalMessage}>{message}</div>
        <div className={styles.warningModalActions}>
          {!hideCancel && (
            <button
              ref={cancelButtonRef}
              type="button"
              className={cancelClassName}
              onClick={onCancel}
              aria-label={cancelLabel || 'Cancel'}
            >
              <X size={16} />
              {cancelLabel ? <span>{cancelLabel}</span> : null}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            type="button"
            className={confirmClassName}
            onClick={onConfirm}
            aria-label={confirmLabel || 'Confirm'}
          >
            <Check size={16} />
            {confirmLabel ? <span>{confirmLabel}</span> : null}
          </button>
        </div>
      </div>
    </div>
  )
}
