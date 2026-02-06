'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './roster.module.css'
import { LayoutGrid, List } from 'lucide-react'

export default function RosterSortControls() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSort = searchParams.get('sort') || 'name'
  const currentView = searchParams.get('view') || 'grid'

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sort = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sort)
    router.push(`?${params.toString()}`)
  }

  const handleViewChange = (view: 'grid' | 'list') => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', view)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className={styles.controls}>
      <div className={styles.sortControls}>
        <select
          id="sort"
          className={styles.sortSelect}
          value={currentSort}
          onChange={handleSortChange}
        >
          <option value="name">Name (A-Z)</option>
          <option value="total">Total Races (High-Low)</option>
          <option value="upcoming">Upcoming Races (High-Low)</option>
          <option value="completed">Completed Races (High-Low)</option>
        </select>
      </div>
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewButton} ${currentView === 'grid' ? styles.active : ''}`}
          onClick={() => handleViewChange('grid')}
          aria-label="Grid view"
        >
          <LayoutGrid size={20} />
        </button>
        <button
          className={`${styles.viewButton} ${currentView === 'list' ? styles.active : ''}`}
          onClick={() => handleViewChange('list')}
          aria-label="List view"
        >
          <List size={20} />
        </button>
      </div>
    </div>
  )
}
