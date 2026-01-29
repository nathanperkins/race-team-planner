'use strict' // Error boundaries must be Client Components
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import styles from './error.module.css'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application Error:', error)
  }, [error])

  return (
    <div className={styles.container}>
      <AlertTriangle size={64} className={styles.icon} />
      <h1 className={styles.title}>Red Flag!</h1>
      <p className={styles.message}>
        Something went wrong under the hood. The stewards are investigating.
        <br />
        <span style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '0.5rem', display: 'block' }}>
          Error: {error.message || 'Unknown error'}
        </span>
      </p>

      <div className={styles.buttonGroup}>
        <button
          onClick={
            // Attempt to recover by trying to re-render the segment
            () => reset()
          }
          className={styles.primaryButton}
        >
          <RotateCcw size={18} />
          Try Again
        </button>
        <Link href="/events" className={styles.secondaryButton}>
          <Home size={18} />
          Events
        </Link>
      </div>
    </div>
  )
}
