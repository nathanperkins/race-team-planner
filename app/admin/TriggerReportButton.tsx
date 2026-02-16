'use client'

import { useState } from 'react'
import { triggerWeeklyReportAction } from './actions'
import { Send, X } from 'lucide-react'
import styles from './TriggerReportButton.module.css'
import { createLogger } from '@/lib/logger'

const logger = createLogger('trigger-report-button')

export default function TriggerReportButton() {
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const handleTrigger = async () => {
    setIsSending(true)
    setShowPopup(true)
    setStatus('sending')
    setMessage('Generating and sending weekly report to Discord...')

    try {
      const result = await triggerWeeklyReportAction()

      if (result.success) {
        setStatus('success')
        setMessage(result.message)
      } else {
        setStatus('error')
        setMessage(`Error: ${result.message}`)
      }
    } catch (error) {
      setStatus('error')
      setMessage(`An unexpected error occurred.`)
      logger.error({ err: error }, 'Failed to trigger weekly report')
    } finally {
      setIsSending(false)
    }
  }

  const closePopup = () => {
    setShowPopup(false)
    setStatus('idle')
    setMessage(null)
  }

  return (
    <>
      <button onClick={handleTrigger} disabled={isSending} className={styles.triggerButton}>
        <Send size={16} />
        Send Weekly Report
      </button>

      {showPopup && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {!isSending && (
              <button onClick={closePopup} className={styles.closeButton} aria-label="Close">
                <X size={20} />
              </button>
            )}

            <div className={styles.statusIcon}>
              {status === 'sending' && <div className={styles.spinner} />}
              {status === 'success' && <div>✅</div>}
              {status === 'error' && <div>❌</div>}
            </div>

            <h3 className={styles.title}>
              {status === 'sending'
                ? 'Sending in Progress'
                : status === 'success'
                  ? 'Sent Successfully'
                  : 'Sending Failed'}
            </h3>

            <p className={styles.message}>{message}</p>

            {!isSending && (
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
