'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { deleteAccount } from '@/app/actions/delete-account'
import styles from './profile.module.css'

export default function DeleteAccountButton() {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!isConfirming) {
      setIsConfirming(true)
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
        setIsConfirming(false)
      }
    } catch (err) {
      console.error('Delete account error:', err)
      setError('An unexpected error occurred')
      setIsConfirming(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={styles.dangerZone}>
      <h2 className={styles.dangerTitle}>Danger Zone</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Once you delete your account, there is no going back. This will delete all your
        registrations and personal data.
      </p>

      {error && (
        <p className={styles.error} style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <button onClick={handleDelete} className={styles.deleteButton} disabled={isDeleting}>
        {isDeleting
          ? 'Deleting...'
          : isConfirming
            ? 'Are you absolutely sure? Click again to confirm.'
            : 'Delete My Account'}
      </button>

      {isConfirming && !isDeleting && (
        <button
          onClick={() => setIsConfirming(false)}
          style={{
            marginTop: '0.5rem',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: '0.875rem',
            cursor: 'pointer',
            textAlign: 'center',
            width: '100%',
          }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}
