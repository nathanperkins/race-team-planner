'use client'

import { useState } from 'react'
import { backfillDiscordNicknamesAction } from './actions'
import { UserCheck, X } from 'lucide-react'
import styles from './TriggerReportButton.module.css'
import { createLogger } from '@/lib/logger'

const logger = createLogger('backfill-nicknames-button')

export default function BackfillNicknamesButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')

  const handleRun = async () => {
    setIsRunning(true)
    setShowPopup(true)
    setStatus('running')
    setMessage('Fetching Discord nicknames for all users...')

    try {
      const result = await backfillDiscordNicknamesAction()

      if (result.success) {
        setStatus('success')
        setMessage(result.message)
      } else {
        setStatus('error')
        setMessage(`Error: ${result.message}`)
      }
    } catch (error) {
      setStatus('error')
      setMessage('An unexpected error occurred.')
      logger.error({ err: error }, 'Backfill nicknames failed')
    } finally {
      setIsRunning(false)
    }
  }

  const closePopup = () => {
    setShowPopup(false)
    setStatus('idle')
    setMessage(null)
  }

  return (
    <>
      <button onClick={handleRun} disabled={isRunning} className={styles.triggerButton}>
        <UserCheck size={16} />
        Backfill Discord Nicknames
      </button>

      {showPopup && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {!isRunning && (
              <button onClick={closePopup} className={styles.closeButton} aria-label="Close">
                <X size={20} />
              </button>
            )}

            <div className={styles.statusIcon}>
              {status === 'running' && <div className={styles.spinner} />}
              {status === 'success' && <div>✅</div>}
              {status === 'error' && <div>❌</div>}
            </div>

            <h3 className={styles.title}>
              {status === 'running'
                ? 'Backfill In Progress'
                : status === 'success'
                  ? 'Backfill Complete'
                  : 'Backfill Failed'}
            </h3>

            <p className={styles.message}>{message}</p>

            {!isRunning && (
              <button
                onClick={closePopup}
                className={`${styles.actionButton} ${
                  status === 'success' ? styles.successButton : styles.errorButton
                }`}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
