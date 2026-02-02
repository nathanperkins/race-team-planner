import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import styles from './profile.module.css'
import UserRoleBadge from '@/components/UserRoleBadge'
import { CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
import DeleteAccountButton from './DeleteAccountButton'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>User Profile</h1>

      {(!session.user.iracingCustomerId ||
        session.user.expectationsVersion < CURRENT_EXPECTATIONS_VERSION) && (
        <div className={styles.onboardingBanner}>
          <div className={styles.onboardingIcon}>!</div>
          <div className={styles.onboardingText}>
            <h3>Account Setup Required</h3>
            <p>
              Please enter your iRacing Customer ID and accept the latest Team Expectations to
              access the rest of the site, enable event registration, and track your statistics.
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
        <div className={styles.field}>
          <label className={styles.label}>
            Team Expectations
            {session.user.expectationsVersion < CURRENT_EXPECTATIONS_VERSION && (
              <span className={styles.requiredBadge}>REQUIRED</span>
            )}
          </label>
          <div className={styles.value}>
            {session.user.expectationsVersion >= CURRENT_EXPECTATIONS_VERSION ? (
              <span className={styles.success}>Accepted (v{session.user.expectationsVersion})</span>
            ) : (
              <span className={styles.error}>Not Accepted</span>
            )}
          </div>
        </div>

        <ProfileForm
          userId={session.user.id!}
          initialCustomerId={session.user.iracingCustomerId || ''}
        />

        <DeleteAccountButton userName={session.user.name || ''} />
      </div>
    </div>
  )
}
