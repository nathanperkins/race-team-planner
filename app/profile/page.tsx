import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import styles from './profile.module.css'
import UserRoleBadge from '@/components/UserRoleBadge'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Profile</h1>

      {!session.user.iracingCustomerId && (
        <div className={styles.onboardingBanner}>
          <div className={styles.onboardingIcon}>!</div>
          <div className={styles.onboardingText}>
            <h3>Setup Required</h3>
            <p>
              Please enter your iRacing Customer ID to enable event registration and statistics
              tracking.
            </p>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <div className={styles.value}>{session.user.name}</div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <div className={styles.value}>{session.user.email}</div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Role</label>
          <div className={styles.value}>
            <UserRoleBadge role={session.user.role} />
          </div>
        </div>

        <ProfileForm
          userId={session.user.id!}
          initialCustomerId={session.user.iracingCustomerId || ''}
        />
      </div>
    </div>
  )
}
