'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/app/actions/update-profile'
import { useSession } from 'next-auth/react'
import { Lock, Loader2 } from 'lucide-react'
import styles from './profile.module.css'

interface Props {
  userId: string
  initialCustomerId: string
  initialIracingName: string
}

export default function ProfileForm({ initialCustomerId, initialIracingName }: Props) {
  const { update } = useSession()
  const router = useRouter()
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async (formData: FormData) => {
    setMessage(null)

    startTransition(async () => {
      try {
        const result = await updateProfile(formData)
        if (result.success) {
          await update() // Refresh the session JWT
          router.refresh() // Refresh the server components
          setMessage({ type: 'success', text: 'Profile updated successfully' })
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to update' })
        }
      } catch (err) {
        console.error('Update profile error:', err)
        setMessage({ type: 'error', text: 'An unexpected error occurred' })
      }
    })
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

      <div className={styles.field}>
        <label className={styles.label}>iRacing Name</label>
        <div className={styles.readOnlyField}>
          <span>
            {customerId === initialCustomerId
              ? initialIracingName || 'Not synced yet'
              : 'ID changed - save to verify'}
          </span>
          <Lock size={14} style={{ opacity: 0.5 }} />
        </div>
      </div>

      <button type="submit" className={styles.button} disabled={isPending}>
        {isPending ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Loader2 className={styles.spin} size={18} />
            Validating & Saving...
          </div>
        ) : (
          'Save Changes'
        )}
      </button>

      {message && !isPending && (
        <div
          className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}
        >
          {message.text}
        </div>
      )}
    </form>
  )
}
