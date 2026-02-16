'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { deleteAccount } from '@/app/actions/delete-account'
import styles from './profile.module.css'
import { createLogger } from '@/lib/logger'

const logger = createLogger('DeleteAccountButton')

interface DeleteAccountButtonProps {
  userName: string
}

export default function DeleteAccountButton({ userName }: DeleteAccountButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nameMatches = confirmName.toLowerCase() === userName.toLowerCase()

  const handleDelete = async () => {
    if (!isConfirming) {
      setIsConfirming(true)
      return
    }

    if (!nameMatches) {
      setError('Name does not match')
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      const result = await deleteAccount()
      if (result.success) {
        // Sign out and redirect to home
        await signOut({ callbackUrl: '/' })
      } else {
        setError(result.error || 'Failed to delete account')
      }
    } catch (err) {
      logger.error({ err }, 'Delete account error')
      setError('An unexpected error occurred')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={styles.dangerZone}>
      <h2 className={styles.dangerTitle}>Danger Zone</h2>
      <p className={styles.dangerDescription}>
        Once you delete your account, there is no going back. This will delete all your
        registrations and personal data.
      </p>

      {isConfirming && (
        <div className={styles.confirmContainer}>
          <p className={styles.confirmLabel}>
            To confirm, please type your name:{' '}
            <span className={styles.confirmNameHighlight}>{userName.toLowerCase()}</span>
          </p>
          <input
            type="text"
            className={styles.input}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Type your name here"
            autoFocus
          />
        </div>
      )}

      {error && <p className={`${styles.error} ${styles.errorMargin}`}>{error}</p>}

      <button
        onClick={handleDelete}
        className={styles.deleteButton}
        disabled={isDeleting || (isConfirming && !nameMatches)}
      >
        {isDeleting ? 'Deleting...' : isConfirming ? 'Confirm Deletion' : 'Delete My Account'}
      </button>

      {isConfirming && !isDeleting && (
        <button
          onClick={() => {
            setIsConfirming(false)
            setConfirmName('')
            setError(null)
          }}
          className={styles.cancelButton}
        >
          Cancel
        </button>
      )}
    </div>
  )
}
