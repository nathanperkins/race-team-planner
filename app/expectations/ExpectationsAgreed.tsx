'use client'

import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
import styles from './expectations.module.css'

export default function ExpectationsAgreed() {
  return (
    <div className={styles.agreedBadge}>
      <div className={styles.agreedContent}>
        <span className={styles.icon}>✅</span>
        <span>You have agreed to Revision v{CURRENT_EXPECTATIONS_VERSION}.</span>
      </div>
    </div>
  )
}
