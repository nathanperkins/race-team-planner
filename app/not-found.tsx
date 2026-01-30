
'use client'

import Link from 'next/link'
import { MapPinOff, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import styles from './error.module.css'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const isAccessDenied = error === 'access_denied_guild_membership'

  if (isAccessDenied) {
    return (
      <div className={styles.container}>
        <ShieldAlert size={64} className={styles.errorIcon} />
        <h1 className={styles.title}>Membership Required</h1>
        <p className={styles.message}>
          Access is restricted to members of our Discord Community.
          <br />
          Please join our Discord server to access the Team Planner.
        </p>
        <div className={styles.buttonGroup}>
          <Link href="/" className={styles.primaryButton}>
            <ArrowLeft size={18} />
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <MapPinOff size={64} className={styles.warningIcon} />
      <h1 className={styles.title}>404 - Off Track?</h1>
      <p className={styles.message}>
        Looks like you missed a braking point. The page you are looking for doesn&apos;t exist or
        has been moved.
      </p>
      <div className={styles.buttonGroup}>
        <Link href="/events" className={styles.primaryButton}>
          <ArrowLeft size={18} />
          Return to Pits
        </Link>
      </div>
    </div>
  )
}

export default function NotFound() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent />
    </Suspense>
  )
}
