import Link from 'next/link'
import { MapPinOff, ArrowLeft } from 'lucide-react'
import styles from './error.module.css'

export default function NotFound() {
  return (
    <div className={styles.container}>
      <MapPinOff size={64} className={styles.warningIcon} />
      <h1 className={styles.title}>404 - Off Track?</h1>
      <p className={styles.message}>
        Looks like you missed a braking point. The page you are looking for doesn&apos;t exist or
        has been moved.
      </p>

      <div className={styles.buttonGroup}>
        <Link href="/events" className={styles.primaryButton}>
          <ArrowLeft size={18} />
          Return to Pits
        </Link>
      </div>
    </div>
  )
}
