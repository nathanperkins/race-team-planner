'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Users, ChevronDown } from 'lucide-react'
import styles from './TeamPickerTrigger.module.css'
import TeamPickerModal from './TeamPickerModal'
import { RaceWithRegistrations, ExtendedRegistration } from './RaceDetails'

interface Props {
  raceId: string
  raceStartTime: Date
  registrations: RaceWithRegistrations['registrations']
  carClasses: { id: string; name: string; shortName: string }[]
  teams: { id: string; name: string }[]
  eventRegistrations?: ExtendedRegistration[]
}

export default function TeamPickerTrigger({
  raceId,
  raceStartTime,
  registrations,
  carClasses,
  teams,
  eventRegistrations,
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={styles.triggerButton}
        onClick={() => setShowDropdown(!showDropdown)}
        title="Automated Team Balancer"
      >
        <Users size={16} />
        <span>Pick Teams</span>
        <ChevronDown size={14} />
      </button>

      {showDropdown && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>Select Car Class</div>
          {carClasses.map((cc) => (
            <button
              key={cc.id}
              className={styles.dropdownItem}
              onClick={() => {
                setSelectedClassId(cc.id)
                setShowDropdown(false)
              }}
            >
              {cc.name}
            </button>
          ))}
        </div>
      )}

      {selectedClassId && (
        <TeamPickerModal
          raceStartTime={raceStartTime}
          className={carClasses.find((c) => c.id === selectedClassId)?.name || ''}
          registrations={registrations.filter((r) => r.carClass.id === selectedClassId)}
          teams={teams}
          onClose={() => setSelectedClassId(null)}
          eventRegistrations={eventRegistrations || []}
          raceId={raceId}
          carClassId={selectedClassId}
        />
      )}
    </div>
  )
}
