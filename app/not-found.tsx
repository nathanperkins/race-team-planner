'use client'

import Link from 'next/link'
import { MapPinOff, ArrowLeft, ShieldAlert } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { GuildMembershipStatus } from '@/lib/discord'
import styles from './error.module.css'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const isAccessDenied = error === GuildMembershipStatus.NOT_MEMBER
  const isConfigError = error === GuildMembershipStatus.CONFIG_ERROR
  const isApiError = error === GuildMembershipStatus.API_ERROR

  if (isAccessDenied || isConfigError || isApiError) {
    return (
      <div className={styles.container}>
        <ShieldAlert size={64} className={styles.errorIcon} />
        <h1 className={styles.title}>
          {isAccessDenied ? 'Membership Required' : 'Authentication Error'}
        </h1>
        <p className={styles.message}>
          {isAccessDenied ? (
            <>Access is restricted to members of our Discord Community.</>
          ) : isConfigError ? (
            <>
              The application is missing required Discord configuration.
              <br />
              Please contact the administrator to verify the Discord configuration.
            </>
          ) : (
            <>
              An error occurred while verifying your community membership.
              <br />
              Please contact an administrator to resolve the issue.
            </>
          )}
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
