'use client'

import { useState } from 'react'
import { syncIRacingEvents } from '@/app/actions/sync-events'
import { Cloud, X } from 'lucide-react'
import styles from './sync-button.module.css'

export default function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [status, setStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')

  const handleSync = async () => {
    setIsSyncing(true)
    setShowPopup(true)
    setStatus('syncing')
    setMessage('Syncing events from iRacing...')

    try {
      const result = await syncIRacingEvents()

      if (result.success) {
        setStatus('success')
        setMessage(`Successfully synced ${result.count} events!`)
      } else {
        setStatus('error')
        setMessage(`Error: ${result.error}`)
      }
    } catch (error) {
      setStatus('error')
      setMessage(`An unexpected error occurred.`)
      console.error(error)
    } finally {
      setIsSyncing(false)
    }
  }

  const closePopup = () => {
    setShowPopup(false)
    setStatus('idle')
    setMessage(null)
  }

  return (
    <>
      <button onClick={handleSync} disabled={isSyncing} className={styles.syncButton}>
        <Cloud size={16} />
        Sync iRacing Events
      </button>

      {showPopup && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            {!isSyncing && (
              <button onClick={closePopup} className={styles.closeButton} aria-label="Close">
                <X size={20} />
              </button>
            )}

            <div className={styles.statusIcon}>
              {status === 'syncing' && <div className={styles.spinner} />}
              {status === 'success' && <div>✅</div>}
              {status === 'error' && <div>❌</div>}
            </div>

            <h3 className={styles.title}>
              {status === 'syncing'
                ? 'Syncing in Progress'
                : status === 'success'
                  ? 'Sync Complete'
                  : 'Sync Failed'}
            </h3>

            <p className={styles.message}>{message}</p>

            {!isSyncing && (
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
