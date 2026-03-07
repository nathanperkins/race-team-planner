'use client'

import { useState } from 'react'
import { triggerWeeklyReportAction } from './actions'
import { Send } from 'lucide-react'
import styles from './TriggerReportButton.module.css'
import ActionModal from '@/components/ActionModal'
import { createLogger } from '@/lib/logger'

const logger = createLogger('trigger-report-button')

export default function TriggerReportButton() {
  const [isActive, setIsActive] = useState(false)
  const [modalStatus, setModalStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState<string | undefined>()

  const handleTrigger = async () => {
    setIsActive(true)
    setModalStatus('loading')
    setTitle('Sending in Progress')
    setDescription('Generating and sending weekly report to Discord...')

    try {
      const result = await triggerWeeklyReportAction()

      if (result.success) {
        setModalStatus('success')
        setTitle('Sent Successfully')
        setDescription(result.message)
      } else {
        setModalStatus('error')
        setTitle('Sending Failed')
        setDescription(`Error: ${result.message}`)
      }
    } catch (error) {
      setModalStatus('error')
      setTitle('Sending Failed')
      setDescription('An unexpected error occurred.')
      logger.error({ err: error }, 'Failed to trigger weekly report')
    }
  }

  const closeModal = () => {
    setIsActive(false)
  }

  return (
    <>
      <button onClick={handleTrigger} disabled={isActive} className={styles.triggerButton}>
        <Send size={16} />
        Send Weekly Report
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
