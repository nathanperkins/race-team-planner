'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import styles from './ActionModal.module.css'

interface Props {
  status: 'loading' | 'success' | 'error'
  title: string
  description?: string
  onClose?: () => void
}

/**
 * Shared modal for long-running actions. Renders via a portal to document.body
 * so it always appears above any stacking context (e.g. backdrop-filter).
 */
export default function ActionModal({ status, title, description, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {status !== 'loading' && onClose && (
          <button onClick={onClose} className={styles.closeButton} aria-label="Dismiss">
            <X size={20} />
          </button>
        )}

        <div className={styles.statusIcon}>
          {status === 'loading' && <div className={styles.spinner} />}
          {status === 'success' && <div>✅</div>}
          {status === 'error' && <div>❌</div>}
        </div>

        <h3 className={styles.title}>{title}</h3>

        {description && <p className={styles.description}>{description}</p>}

        {status !== 'loading' && onClose && (
          <button
            onClick={onClose}
            className={`${styles.actionButton} ${status === 'success' ? styles.successButton : styles.errorButton}`}
          >
            Close
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
