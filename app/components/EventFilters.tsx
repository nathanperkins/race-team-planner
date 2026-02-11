'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useState, useRef, useEffect } from 'react'
import { Filter, ChevronDown, ChevronUp, X } from 'lucide-react'
import styles from './EventFilters.module.css'

interface EventFiltersProps {
  carClasses: { id: string; name: string; shortName: string }[]
  racers: { id: string; name: string | null }[]
  currentFilters: {
    registrations?: string
    carClass?: string
    racer?: string
    from?: string
    to?: string
    name?: string
    eligible?: string
  }
}

export default function EventFilters({ carClasses, racers, currentFilters }: EventFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [nameFilter, setNameFilter] = useState(currentFilters.name || '')
  const [isExpanded, setIsExpanded] = useState(false)

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(name, value)
      } else {
        params.delete(name)
      }
      return params.toString()
    },
    [searchParams]
  )

  const handleFilterChange = useCallback(
    (name: string, value: string) => {
      router.push(pathname + '?' + createQueryString(name, value))
    },
    [router, pathname, createQueryString]
  )

  // Debounce name filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (nameFilter !== (currentFilters.name || '')) {
        handleFilterChange('name', nameFilter)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [nameFilter, currentFilters.name, handleFilterChange])

  const [isRacerDropdownOpen, setIsRacerDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRacerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownRef])

  const activeFilterCount = [
    currentFilters.registrations,
    currentFilters.carClass,
    currentFilters.racer,
    currentFilters.from,
    currentFilters.to,
    currentFilters.name,
    currentFilters.eligible,
  ].filter(Boolean).length

  return (
    <div className={styles.filterBar}>
      <button className={styles.mobileToggleButton} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.mobileToggleButtonLabel}>
          <Filter size={18} />
          <span>Filters</span>
          {activeFilterCount > 0 && <span className={styles.filterBadge}>{activeFilterCount}</span>}
        </div>
        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      <div className={`${styles.filterContent} ${isExpanded ? styles.isExpanded : ''}`}>
        <div className={styles.filterGroup}>
          <label
            htmlFor="eligible"
            className={styles.filterLabel}
            data-tooltip="Show only events where you meet the license requirements."
          >
            Eligible
          </label>
            <input
              id="eligible"
              type="checkbox"
              className={styles.filterCheckbox}
              checked={currentFilters.eligible === 'true'}
              onChange={(e) => handleFilterChange('eligible', e.target.checked ? 'true' : '')}
            />          
        </div>

        <div className={styles.filterGroup}>
          <label
            htmlFor="name"
            className={styles.filterLabel}
            data-tooltip="Filter by event name or track."
          >
            Event / Track
          </label>
          <input
            id="name"
            type="text"
            className={styles.filterInput}
            placeholder="Search events or tracks..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label
            htmlFor="registrations"
            className={styles.filterLabel}
            data-tooltip="Show only events with or without active registrations."
          >
            Registrations
          </label>
          <select
            id="registrations"
            className={styles.filterSelect}
            value={currentFilters.registrations || ''}
            onChange={(e) => handleFilterChange('registrations', e.target.value)}
          >
            <option value="">All Events</option>
            <option value="any">Any Registrations</option>
            <option value="mine">My Registrations</option>
            <option value="none">No Registrations</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label
            htmlFor="carClass"
            className={styles.filterLabel}
            data-tooltip="Filter by car class (e.g., GT3, LMP2)."
          >
            Car Class
          </label>
          <select
            id="carClass"
            className={styles.filterSelect}
            value={currentFilters.carClass || ''}
            onChange={(e) => handleFilterChange('carClass', e.target.value)}
          >
            <option value="">All Classes</option>
            {carClasses.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.shortName || cc.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label
            htmlFor="racer"
            className={styles.filterLabel}
            data-tooltip="Shows events where ALL selected racers are registered."
          >
            Racers
          </label>
          <div className={styles.relative} ref={dropdownRef}>
            <button
              id="racer"
              className={styles.filterSelect}
              onClick={() => setIsRacerDropdownOpen(!isRacerDropdownOpen)}
              style={{
                minWidth: '150px',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {currentFilters.racer
                ? `${currentFilters.racer.split(',').length} Selected`
                : 'All Racers'}
              <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>

            {isRacerDropdownOpen && (
              <div className={styles.multiSelectDropdown}>
                {racers.map((racer) => {
                  const selectedRacers = currentFilters.racer ? currentFilters.racer.split(',') : []
                  const isSelected = selectedRacers.includes(racer.id)

                  return (
                    <label key={racer.id} className={styles.multiSelectItem}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected}
                        onChange={() => {
                          let newSelected = [...selectedRacers]
                          if (isSelected) {
                            newSelected = newSelected.filter((id) => id !== racer.id)
                          } else {
                            newSelected.push(racer.id)
                          }
                          handleFilterChange('racer', newSelected.join(','))
                        }}
                      />
                      {racer.name || 'Unknown'}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label
            htmlFor="from"
            className={styles.filterLabel}
            data-tooltip="Show events starting on or after this date."
          >
            From
          </label>
          <input
            id="from"
            type="date"
            className={styles.filterInput}
            value={currentFilters.from || ''}
            onChange={(e) => handleFilterChange('from', e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label
            htmlFor="to"
            className={styles.filterLabel}
            data-tooltip="Show events starting on or before this date."
          >
            To
          </label>
          <input
            id="to"
            type="date"
            className={styles.filterInput}
            value={currentFilters.to || ''}
            onChange={(e) => handleFilterChange('to', e.target.value)}
          />
        </div>

        {activeFilterCount > 0 && (
          <button
            className={styles.clearButton}
            onClick={() => {
              setNameFilter('')
              router.push(pathname)
            }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>
    </div>
  )
}
