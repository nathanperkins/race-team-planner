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
  onDropdownToggle?: (open: boolean) => void
}

export default function TeamPickerTrigger({
  raceId,
  raceStartTime,
  registrations,
  carClasses,
  teams,
  eventRegistrations,
  onDropdownToggle,
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down')
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

  const computeOpenDirection = () => {
    const rect = dropdownRef.current?.getBoundingClientRect()
    if (!rect) return
    const threshold = 220
    const shouldOpenUp = rect.bottom > window.innerHeight - threshold
    setOpenDirection(shouldOpenUp ? 'up' : 'down')
  }

  useEffect(() => {
    onDropdownToggle?.(showDropdown)
  }, [showDropdown, onDropdownToggle])

  useEffect(() => {
    if (!showDropdown) return
    window.addEventListener('resize', computeOpenDirection)
    window.addEventListener('scroll', computeOpenDirection, true)
    return () => {
      window.removeEventListener('resize', computeOpenDirection)
      window.removeEventListener('scroll', computeOpenDirection, true)
    }
  }, [showDropdown])

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={styles.triggerButton}
        onClick={() => {
          const next = !showDropdown
          if (next) {
            computeOpenDirection()
          }
          setShowDropdown(next)
        }}
        title="Automated Team Balancer"
      >
        <Users size={16} />
        <span>Pick Teams</span>
        <ChevronDown size={14} />
      </button>

      {showDropdown && (
        <div className={`${styles.dropdown} ${openDirection === 'up' ? styles.dropdownUp : ''}`}>
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
