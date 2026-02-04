'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import AddEventModal from './AddEventModal'
import styles from './AddEventButton.module.css'

export default function AddEventButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button className={styles.button} onClick={() => setIsOpen(true)}>
        <Plus size={20} />
        Add Custom Event
      </button>
      {isOpen && <AddEventModal onClose={() => setIsOpen(false)} />}
    </>
  )
}
