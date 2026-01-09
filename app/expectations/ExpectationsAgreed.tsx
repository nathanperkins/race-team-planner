'use client'

import styles from './expectations.module.css'

export default function ExpectationsAgreed() {
  return (
    <div className={styles.agreedBadge}>
      <div className={styles.agreedContent}>
        <span className={styles.icon}>✅</span>
        <span>You have agreed to the current team expectations.</span>
      </div>
    </div>
  )
}
