'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile, validateCustomerId } from '@/app/actions/update-profile'
import { useSession } from 'next-auth/react'
import { Lock, Loader2 } from 'lucide-react'
import { getOnboardingStatus, OnboardingStatus } from '@/lib/onboarding'
import styles from './profile.module.css'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ProfileForm')

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
  const [confirmationModal, setConfirmationModal] = useState<{
    customerId: number
    name: string
    formData: FormData
  } | null>(null)

  // Determine if this is an onboarding flow (user doesn't have a customer ID yet)
  const isOnboarding = getOnboardingStatus(session) === OnboardingStatus.NO_CUSTOMER_ID

  const performUpdate = (formData: FormData) => {
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
        logger.error({ err }, 'Update profile error')
        setMessage({ type: 'error', text: 'An unexpected error occurred' })
      }
    })
  }

  const handleInitialSubmit = async (formData: FormData) => {
    setMessage(null)

    const customerIdStr = (formData.get('customerId') as string)?.trim() || null
    const newCustomerId = customerIdStr ? parseInt(customerIdStr, 10) : null

    // If ID hasn't changed, just submit directly
    if (customerIdStr === initialCustomerId) {
      performUpdate(formData)
      return
    }

    // If ID is cleared (set to empty/null), submit directly
    if (!newCustomerId) {
      performUpdate(formData)
      return
    }

    // If invalid number
    if (isNaN(newCustomerId)) {
      setMessage({ type: 'error', text: 'Invalid iRacing Customer ID.' })
      return
    }

    // ID changed and is valid number => Validate with API
    startTransition(async () => {
      try {
        const result = await validateCustomerId(newCustomerId)
        if (!result.success || !result.name) {
          setMessage({
            type: 'error',
            text: result.error || 'Could not validate customer ID',
          })
          return
        }

        setConfirmationModal({
          customerId: newCustomerId,
          name: result.name,
          formData,
        })
      } catch (err) {
        logger.error({ err }, 'Validation error')
        setMessage({ type: 'error', text: 'Failed to validate customer ID' })
      }
    })
  }

  const confirmUpdate = () => {
    if (confirmationModal) {
      performUpdate(confirmationModal.formData)
      setConfirmationModal(null)
    }
  }

  return (
    <>
      <form action={handleInitialSubmit}>
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

      {confirmationModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalTitle}>Confirm iRacing Identity</div>
            <div className={styles.modalText}>
              We found the following iRacing account for ID{' '}
              <strong>{confirmationModal.customerId}</strong>:
              <span className={styles.modalHighlight}>{confirmationModal.name}</span>
            </div>
            <div className={styles.modalText} style={{ fontSize: '0.875rem' }}>
              Is this you? Incorrect IDs will prevent you from being assigned to races correctly.
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setConfirmationModal(null)}
              >
                Cancel
              </button>
              <button type="button" className={styles.confirmButton} onClick={confirmUpdate}>
                Yes, That&apos;s Me
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
