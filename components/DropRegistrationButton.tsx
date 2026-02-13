'use client'

import { useState } from 'react'
import { deleteRegistration } from '@/app/actions'
import styles from './DropRegistrationButton.module.css'
import { Trash2, Check, X, Loader2, ChevronDown } from 'lucide-react'

interface Props {
  registrationId: string
  className?: string
  onConfirmingChange?: (confirming: boolean) => void
  variant?: 'icon' | 'full'
  isAssignedToTeam?: boolean
  confirmStyle?: 'modal' | 'inline'
  onConfirmDrop?: () => Promise<void> | void
}

export default function DropRegistrationButton({
  registrationId,
  className,
  onConfirmingChange,
  variant = 'icon',
  isAssignedToTeam = false,
  confirmStyle = 'modal',
  onConfirmDrop,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'deleting'>('idle')

  const handleInitialClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setStatus('confirming')
    onConfirmingChange?.(true)
  }

  const handleConfirmClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setStatus('deleting')
    try {
      if (onConfirmDrop) {
        await onConfirmDrop()
      } else {
        await deleteRegistration(registrationId)
      }
      // Redirect happens on server, so we might unmount.
      // If no redirect, we just stay here, but usually component will unmount or re-render.
    } catch (error) {
      console.error('Failed to drop', error)
      setStatus('idle')
      onConfirmingChange?.(false)
      alert('Failed to drop registration. Please try again.')
      return
    }

    onConfirmingChange?.(false)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setStatus('idle')
    onConfirmingChange?.(false)
  }

  // Handle clicking outside/clearing confirmation if mouse leaves?
  // Maybe better to just have a cancel button or timeout.
  // Let's rely on explicit interactions.

  if (status === 'deleting') {
    return (
      <span
        className={`${styles.dropWrapper} ${variant === 'full' ? styles.fullWidthWrapper : ''}`}
      >
        {variant === 'full' ? (
          <button
            className={`${styles.button} ${styles.fullWidthButton} ${styles.deleting} ${className || ''}`}
            disabled
          >
            <span>Dropping...</span>
            <ChevronDown size={14} />
          </button>
        ) : (
          <button className={`${styles.button} ${styles.deleting} ${className || ''}`} disabled>
            <Loader2 className={styles.spinner} size={14} />
            <span>Dropping...</span>
          </button>
        )}
      </span>
    )
  }

  return (
    <>
      <span
        className={`${styles.dropWrapper} ${variant === 'full' ? styles.fullWidthWrapper : ''} ${
          status === 'confirming' && confirmStyle === 'inline' ? styles.confirmingInline : ''
        }`}
      >
        <button
          className={`${styles.button} ${variant === 'icon' ? styles.iconOnly : styles.fullWidthButton} ${className || ''} ${
            status === 'confirming' && confirmStyle === 'inline' ? styles.hiddenTrigger : ''
          }`}
          onClick={handleInitialClick}
          aria-label="Drop registration"
          title="Drop"
        >
          <Trash2 size={14} />
          {variant === 'full' && <span>Drop</span>}
        </button>

        {status === 'confirming' && confirmStyle === 'inline' && (
          <div className={`${styles.confirmGroup} ${styles.confirmGroupFloating}`}>
            <button className={styles.confirmButton} onClick={handleConfirmClick}>
              <Check size={14} />
              <span>Confirm Drop</span>
            </button>
            <button className={styles.cancelButton} onClick={handleCancel} title="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
      </span>

      {status === 'confirming' && confirmStyle === 'inline' && (
        <div
          className={styles.inlineBlocker}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          aria-hidden="true"
        />
      )}

      {status === 'confirming' && confirmStyle === 'modal' && (
        <div className={styles.warningModalOverlay} onClick={handleCancel}>
          <div className={styles.warningModal} onClick={(e) => e.stopPropagation()}>
            <h4 className={styles.warningModalTitle}>Confirm Drop</h4>
            <p className={styles.warningModalMessage}>
              {isAssignedToTeam
                ? 'You are assigned to a team! Are you sure you want to unregister? Your teammates need you!'
                : 'Are you sure you want to unregister from this event?'}
            </p>
            <div className={styles.warningModalActions}>
              <button
                type="button"
                className={styles.warningConfirm}
                onClick={handleConfirmClick}
                aria-label="Confirm drop"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                className={styles.warningCancel}
                onClick={handleCancel}
                aria-label="Cancel drop"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
