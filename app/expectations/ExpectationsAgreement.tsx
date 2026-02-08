'use client'

import { useTransition } from 'react'
import { agreeToExpectations } from '@/app/actions'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
import { useSession } from 'next-auth/react'
import styles from './expectations.module.css'

export default function ExpectationsAgreement() {
  const [isPending, startTransition] = useTransition()
  const { update } = useSession()

  return (
    <section className={`${styles.section} ${styles.pendingAgreement}`}>
      <div className={styles.sectionHeader}>
        <span className={styles.icon}>⚠️</span>
        <h2 className={styles.sectionTitle}>Action Required</h2>
      </div>
      <span className={styles.tagline}>By signing up, you confirm that you:</span>
      <ul className={styles.list}>
        <li className={styles.listItem}>Have read and understand these expectations</li>
        <li className={styles.listItem}>Agree to operate with the team in mind</li>
      </ul>

      <div className={styles.versionAgreement} style={{ marginTop: '1.5rem', marginBottom: '0' }}>
        Revision v{CURRENT_EXPECTATIONS_VERSION}
      </div>

      <button
        onClick={() =>
          startTransition(async () => {
            const result = await agreeToExpectations()
            if (result.success && result.data) {
              // Push the new data directly to the Edge cookie.
              await update({ expectationsVersion: result.data.expectationsVersion })
              // Now navigate - the cookie is already updated
              window.location.href = '/profile'
            }
          })
        }
        disabled={isPending}
        className={styles.agreeButton}
        style={{ marginTop: '0.75rem' }}
      >
        {isPending ? 'Agreeing...' : 'I Agree'}
      </button>
    </section>
  )
}
