'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from '@/app/actions/update-profile'
import { useSession } from 'next-auth/react'
import { Lock, Loader2 } from 'lucide-react'
import { getOnboardingStatus, OnboardingStatus } from '@/lib/onboarding'
import styles from './profile.module.css'

interface Props {
  userId: string
  initialCustomerId: string
  initialIracingName: string
}

export default function ProfileForm({ initialCustomerId, initialIracingName }: Props) {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Determine if this is an onboarding flow (user doesn't have a customer ID yet)
  const isOnboarding = getOnboardingStatus(session) === OnboardingStatus.NO_CUSTOMER_ID

  const handleSubmit = async (formData: FormData) => {
    setMessage(null)

    startTransition(async () => {
      try {
        const result = await updateProfile(formData)
        if (result.success && result.data) {
          if (isOnboarding) {
            // Push the new data directly to the Edge cookie.
            // This is matched by the update handler in auth.config.ts.
            await update({
              iracingCustomerId: result.data.iracingCustomerId,
              expectationsVersion: result.data.expectationsVersion,
            })
            // Hard navigate to events - because the cookie is fresh,
            // the proxy.ts middleware will allow the request.
            window.location.href = '/events'
          } else {
            router.refresh()
            setMessage({ type: 'success', text: 'Profile updated successfully' })
          }
        } else if (result.success) {
          router.refresh()
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
