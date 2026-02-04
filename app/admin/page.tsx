import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import styles from './admin.module.css'
import AddEventButton from './AddEventButton'

export default async function AdminPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/events')
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Admin Panel</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Event Management</h2>
          <AddEventButton />
        </div>
        <p className={styles.description}>
          Add custom events to the database or manage existing events.
        </p>
      </section>
    </div>
  )
}
