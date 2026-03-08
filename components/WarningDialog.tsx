'use client'

import type { ReactNode } from 'react'
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
}: WarningDialogProps) {
  if (!isOpen) return null

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
              type="button"
              className={styles.warningCancel}
              onClick={onCancel}
              aria-label={cancelLabel || 'Cancel'}
            >
              <X size={16} />
              {cancelLabel ? <span>{cancelLabel}</span> : null}
            </button>
          )}
          <button
            type="button"
            className={styles.warningConfirm}
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
