'use client'

import React, { useMemo } from 'react'
import { Globe } from 'lucide-react'
import { getTimeZoneOptions } from '@/lib/timezone-utils'
import { useTimeZone } from './TimeZoneProvider'
import styles from './TimeZoneSelector.module.css'

export function TimeZoneOptions({ localTimeZone }: { localTimeZone?: string }) {
  const { common, all } = useMemo(() => getTimeZoneOptions(localTimeZone), [localTimeZone])

  return (
    <>
      <optgroup label="Common Time Zones">
        {common.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </optgroup>
      {all.length > 0 && (
        <optgroup label="All Time Zones">
          {all.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

interface TimeZoneSelectorProps {
  compact?: boolean
  className?: string
}

export default function TimeZoneSelector({ compact = false, className }: TimeZoneSelectorProps) {
  const { timeZone, localTimeZone, setTimeZone } = useTimeZone()

  return (
    <div
      className={`${styles.wrapper} ${compact ? styles.compact : ''} ${className ?? ''}`.trim()}
      title="Select time zone for displaying race times"
    >
      <Globe size={14} className={styles.icon} aria-hidden="true" />
      <select
        aria-label="Display time zone"
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        className={styles.select}
      >
        <TimeZoneOptions localTimeZone={localTimeZone} />
      </select>
    </div>
  )
}
