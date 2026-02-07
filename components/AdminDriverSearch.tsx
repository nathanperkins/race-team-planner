'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { adminRegisterDriver } from '@/app/actions'
import styles from './AdminDriverSearch.module.css'

interface Driver {
  id: string
  name: string | null
  image: string | null
}

interface Props {
  raceId: string
  registeredUserIds: string[]
  allDrivers: Driver[]
  defaultCarClassId: string
  onDropdownToggle?: (open: boolean) => void
  onSuccess?: (payload: {
    message: string
    registration?: {
      id: string
      userId: string | null
      manualDriverId: string | null
      carClass: { id: string; name: string; shortName: string }
      team?: { id: string; name: string } | null
      manualDriver?: { id: string; name: string; irating: number; image: string | null } | null
      user?: {
        name: string | null
        image: string | null
        racerStats: Array<{
          category: string
          categoryId: number
          irating: number
          safetyRating: number
          groupName: string
        }>
      } | null
    } | null
  }) => void
}

export default function AdminDriverSearch({
  raceId,
  registeredUserIds,
  allDrivers,
  defaultCarClassId,
  onDropdownToggle,
  onSuccess,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down')
  const [searchQuery, setSearchQuery] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter drivers not yet registered
  const unregisteredDrivers = allDrivers.filter((d) => !registeredUserIds.includes(d.id))

  // Filter by search query
  const filteredDrivers = unregisteredDrivers.filter((d) =>
    d.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const computeOpenDirection = () => {
    const rect = dropdownRef.current?.getBoundingClientRect()
    if (!rect) return
    const threshold = 220
    const shouldOpenUp = rect.bottom > window.innerHeight - threshold
    setOpenDirection(shouldOpenUp ? 'up' : 'down')
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('resize', computeOpenDirection)
    window.addEventListener('scroll', computeOpenDirection, true)
    return () => {
      window.removeEventListener('resize', computeOpenDirection)
      window.removeEventListener('scroll', computeOpenDirection, true)
    }
  }, [isOpen])

  useEffect(() => {
    onDropdownToggle?.(isOpen)
  }, [isOpen, onDropdownToggle])

  // Handle driver selection
  const handleSelectDriver = async (driver: Driver) => {
    try {
      const formData = new FormData()
      formData.append('raceId', raceId)
      formData.append('userId', driver.id)
      formData.append('carClassId', defaultCarClassId)

      const result = await adminRegisterDriver({ message: '', timestamp: 0 }, formData)

      if (result.message === 'Success') {
        setIsOpen(false)
        setSearchQuery('')
        onSuccess?.({
          message: `${driver.name || 'Driver'} Added!`,
          registration: result.registration ?? null,
        })
      } else {
        setErrorMessage(result.message)
        setTimeout(() => setErrorMessage(''), 3000)
      }
    } catch {
      setErrorMessage('Failed to register driver')
      setTimeout(() => setErrorMessage(''), 3000)
    }
  }

  if (unregisteredDrivers.length === 0) {
    return (
      <div className={styles.noDrivers}>
        <p>All drivers registered for this race</p>
      </div>
    )
  }

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        type="button"
        className={styles.searchButton}
        onClick={() => {
          const next = !isOpen
          if (next) {
            computeOpenDirection()
          }
          setIsOpen(next)
        }}
      >
        <Plus size={16} />
        Add Driver
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} ${openDirection === 'up' ? styles.dropdownUp : ''}`}>
          <div className={styles.searchInputWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className={styles.driverList}>
            {filteredDrivers.length === 0 ? (
              <div className={styles.noResults}>
                {searchQuery ? 'No drivers match your search' : 'No available drivers'}
              </div>
            ) : (
              filteredDrivers.map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  className={styles.driverItem}
                  onClick={() => handleSelectDriver(driver)}
                >
                  <Image
                    src={
                      driver.image ||
                      `https://api.dicebear.com/9.x/avataaars/png?seed=${driver.name}`
                    }
                    alt={driver.name || 'User'}
                    className={styles.avatar}
                    width={32}
                    height={32}
                  />
                  <span className={styles.driverName}>{driver.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}
    </div>
  )
}
