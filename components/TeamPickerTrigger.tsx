'use client'

import React from 'react'
import { Users } from 'lucide-react'
import styles from './TeamPickerTrigger.module.css'

interface Props {
  onOpen: () => void
  disabled?: boolean
}

export default function TeamPickerTrigger({ onOpen, disabled }: Props) {
  return (
    <div className={styles.container}>
      <button
        className={styles.triggerButton}
        onClick={onOpen}
        title="Automated Team Balancer"
        disabled={disabled}
      >
        <Users size={16} />
        <span>Pick Teams</span>
      </button>
    </div>
  )
}
