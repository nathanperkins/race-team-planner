'use client'

import { useState } from 'react'
import { backfillDiscordNicknamesAction } from './actions'
import { UserCheck } from 'lucide-react'
import styles from './TriggerReportButton.module.css'
import ActionModal from '@/components/ActionModal'
import { createLogger } from '@/lib/logger'

const logger = createLogger('backfill-nicknames-button')

export default function BackfillNicknamesButton() {
  const [isActive, setIsActive] = useState(false)
  const [modalStatus, setModalStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState<string | undefined>()

  const handleRun = async () => {
    setIsActive(true)
    setModalStatus('loading')
    setTitle('Backfill In Progress')
    setDescription('Fetching Discord nicknames for all users...')

    try {
      const result = await backfillDiscordNicknamesAction()

      if (result.success) {
        setModalStatus('success')
        setTitle('Backfill Complete')
        setDescription(result.message)
      } else {
        setModalStatus('error')
        setTitle('Backfill Failed')
        setDescription(`Error: ${result.message}`)
      }
    } catch (error) {
      setModalStatus('error')
      setTitle('Backfill Failed')
      setDescription('An unexpected error occurred.')
      logger.error({ err: error }, 'Backfill nicknames failed')
    }
  }

  const closeModal = () => {
    setIsActive(false)
  }

  return (
    <>
      <button onClick={handleRun} disabled={isActive} className={styles.triggerButton}>
        <UserCheck size={16} />
        Backfill Discord Nicknames
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
