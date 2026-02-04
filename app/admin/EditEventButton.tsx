'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import EditEventModal from './EditEventModal'
import styles from './AddEventButton.module.css'

interface EventData {
  id: string
  name: string
  track: string
  trackConfig?: string | null
  description?: string | null
  startTime: Date | string
  endTime: Date | string
  durationMins?: number | null
  licenseGroup?: number | null
  tempValue?: number | null
  tempUnits?: number | null
  relHumidity?: number | null
  skies?: number | null
  precipChance?: number | null
}

interface EditEventButtonProps {
  event: EventData
}

export default function EditEventButton({ event }: EditEventButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => setIsOpen(true)}
        title="Edit Event"
        style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
      >
        <Pencil size={14} /> Edit
      </button>

      {isOpen && <EditEventModal onClose={() => setIsOpen(false)} event={event} />}
    </>
  )
}
