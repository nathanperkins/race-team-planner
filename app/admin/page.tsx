import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import styles from './admin.module.css'
import AddEventButton from './AddEventButton'
import SyncButton from '@/app/components/SyncButton'
import TriggerReportButton from './TriggerReportButton'
import TeamManagement from './TeamManagement'

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
        <p className={styles.description}>Add custom events to the database.</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Global Team Management</h2>
        </div>
        <p className={styles.description}>
          Add teams by iRacing Team ID. Team names are automatically fetched from the iRacing API.
        </p>
        <TeamManagement />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>System Operations</h2>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <SyncButton />
          <TriggerReportButton />
        </div>
        <p className={styles.description}>Manually trigger system tasks.</p>
      </section>
    </div>
  )
}
