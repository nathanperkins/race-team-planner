'use client'

import { useState } from 'react'
import { updateProfile } from '@/app/actions/update-profile'
import { useSession } from 'next-auth/react'
import styles from './profile.module.css'

interface Props {
  userId: string
  initialCustomerId: string
}

export default function ProfileForm({ initialCustomerId }: Props) {
  const { update } = useSession()
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async (formData: FormData) => {
    setIsSaving(true)
    setMessage(null)

    try {
      const result = await updateProfile(formData)
      if (result.success) {
        await update() // Refresh the session JWT
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
          {!initialCustomerId && <span className={styles.requiredBadge}>REQUIRED</span>}
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

      <button type="submit" className={styles.button} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Changes'}
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
