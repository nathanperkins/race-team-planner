'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/app/actions/update-profile'
import { syncCurrentUserAction } from '@/app/actions/sync'
import styles from './profile.module.css'

interface Props {
  userId: string
  initialCustomerId: string
}

export default function ProfileForm({ initialCustomerId }: Props) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSync = async () => {
    if (!customerId) return

    setIsSyncing(true)
    setMessage(null)
    try {
      const result = await syncCurrentUserAction()
      if (result.success) {
        setMessage({ type: 'success', text: 'iRacing stats updated successfully' })
        router.refresh()
      } else {
        setMessage({ type: 'error', text: 'error' in result ? result.error : 'Failed to sync' })
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred during sync' })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSubmit = async (formData: FormData) => {
    setIsSaving(true)
    setMessage(null)

    try {
      const result = await updateProfile(formData)
      if (result.success) {
        setMessage({ type: 'success', text: 'Profile updated successfully' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update' })
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form action={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="customerId" className={styles.label}>
          iRacing Customer ID
        </label>
        <input
          id="customerId"
          name="customerId"
          type="text"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="123456"
          className={styles.input}
        />
      </div>

      <button type="submit" className={styles.button} disabled={isSaving || isSyncing}>
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>

      <div className={styles.divider}>or</div>

      <button
        type="button"
        onClick={handleSync}
        className={styles.syncButton}
        disabled={isSaving || isSyncing || !customerId}
        title={!customerId ? 'Set your Customer ID first' : ''}
      >
        {isSyncing ? 'Updating Stats...' : 'Update My iRacing Stats'}
      </button>

      {message && (
        <div
          className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}
        >
          {message.text}
        </div>
      )}
    </form>
  )
}
