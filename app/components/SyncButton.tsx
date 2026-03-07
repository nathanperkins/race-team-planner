'use client'

import { useState } from 'react'
import { syncGlobalDataAction } from '@/app/actions/sync'
import { Cloud } from 'lucide-react'
import styles from './sync-button.module.css'
import ActionModal from '@/components/ActionModal'
import { createLogger } from '@/lib/logger'

const logger = createLogger('SyncButton')

export default function SyncButton() {
  const [isActive, setIsActive] = useState(false)
  const [modalStatus, setModalStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState<string | undefined>()

  const handleSync = async () => {
    setIsActive(true)
    setModalStatus('loading')
    setTitle('Syncing in Progress')
    setDescription('Syncing events from iRacing...')

    try {
      const result = await syncGlobalDataAction()

      if (result.success) {
        setModalStatus('success')
        setTitle('Sync Complete')
        setDescription(
          [
            `• ${result.eventsCount} events`,
            `• ${result.carClassesCount} car classes`,
            `• ${result.usersCount} users`,
          ].join('\n')
        )
      } else {
        setModalStatus('error')
        setTitle('Sync Failed')
        setDescription(`Error: ${'error' in result ? result.error : 'Unknown error'}`)
      }
    } catch (error) {
      setModalStatus('error')
      setTitle('Sync Failed')
      setDescription('An unexpected error occurred.')
      logger.error({ err: error }, 'Sync failed with unexpected error')
    }
  }

  const closeModal = () => {
    setIsActive(false)
  }

  return (
    <>
      <button onClick={handleSync} disabled={isActive} className={styles.syncButton}>
        <Cloud size={16} />
        Sync with iRacing
      </button>

      {isActive && (
        <ActionModal
          status={modalStatus}
          title={title}
          description={description}
          onClose={closeModal}
        />
      )}
    </>
  )
}
