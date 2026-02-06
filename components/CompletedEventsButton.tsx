'use client'
import { CheckCircle2 } from 'lucide-react'
import styles from '../app/roster/roster.module.css'

interface Registration {
  id: string
  race: {
    endTime: Date
    event: {
      name: string
    }
  }
  carClass: {
    name: string
  }
}

interface Props {
  registrations: Registration[]
  className?: string
}

export default function CompletedEventsButton({ registrations, className }: Props) {
  return (
    <div className={`${styles.statItem}${className ? ` ${className}` : ''}`}>
      <span className={styles.statValue}>{registrations.length}</span>
      <div className={styles.statLabel}>
        <CheckCircle2 size={14} />
        Completed
      </div>
    </div>
  )
}
