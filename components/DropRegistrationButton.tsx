'use client'

import { useState } from 'react'
import { deleteRegistration } from '@/app/actions'
import styles from './DropRegistrationButton.module.css'
import { Trash2, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  registrationId: string
  className?: string
  onConfirmingChange?: (confirming: boolean) => void
}

export default function DropRegistrationButton({
  registrationId,
  className,
  onConfirmingChange,
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
      await deleteRegistration(registrationId)
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
      <span className={styles.dropWrapper}>
        <button className={`${styles.button} ${styles.deleting} ${className || ''}`} disabled>
          <Loader2 className={styles.spinner} size={14} />
          <span>Dropping...</span>
        </button>
      </span>
    )
  }

  if (status === 'confirming') {
    return (
      <span className={styles.dropWrapper}>
        <span className={styles.placeholder} aria-hidden="true" />
        <div className={`${styles.confirmGroup} ${className || ''}`}>
          <button className={styles.confirmButton} onClick={handleConfirmClick}>
            <AlertCircle size={14} />
            <span>Confirm Drop</span>
          </button>
          <button className={styles.cancelButton} onClick={handleCancel} title="Cancel">
            X
          </button>
        </div>
      </span>
    )
  }

  return (
    <span className={styles.dropWrapper}>
      <button
        className={`${styles.button} ${styles.iconOnly} ${className || ''}`}
        onClick={handleInitialClick}
        aria-label="Drop registration"
        title="Drop"
      >
        <Trash2 size={14} />
      </button>
    </span>
  )
}
