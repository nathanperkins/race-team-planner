'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './roster.module.css'

export default function RosterSortControls() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSort = searchParams.get('sort') || 'name'

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sort = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sort)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className={styles.sortControls}>
      <label htmlFor="sort" className={styles.sortLabel}>
        Sort by:
      </label>
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
  )
}
